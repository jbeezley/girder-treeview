/**
 * @param {object} [options]
 * @param {string} [api=girder.apiRoot]
 *   URL to a girder instance
 * @param {string} [token=girder.currentToken]
 *   An authentication token to pass with rest requests.
 * @param {object} [glyph]
 *   A mapping of icon classes as described by
 *   https://github.com/mar10/fancytree/wiki/ExtGlyph
 * @param {boolean} [persist=false]
 *   Persist the tree in local storage.  WARNING: because
 *   nodes are loaded lazily, this will flood the server
 *   with requests on load.
 * @param {boolean} [edit=false]
 *   Allow nodes to be edited and created by the user.
 * @param {boolean} [dragAndDrop=false]
 *   Enable drag and drop interactions.
 * @param {function} [icon]
 *   A function that should return an icon class.  Takes the model object as an argument.
 *   Return a falsey value to use the default.
 * @param {object} [iconMap]
 *   A mapping of model type to icon class to override defaults.
 * @param {boolean} [mockMutations=false] Mock all calls write calls to the server
 */

$.fn.girderTreeview = function (options) {
  'use strict';

  options = options || {};
  var girder = window.girder || {};

  var api = options.api || girder.apiRoot;
  options.icon = options.icon || $.noop;

  var pageSize = options.pageSize || 25;

  /*
  var $alert = $('<div/>').addClass('gt-alert alert hidden')
    .attr('role', 'alert').appendTo(this);
  */

  var iconMap = $.extend({
    collection: 'icon-database',
    user: 'icon-user',
    item: 'icon-docs',
    folder: 'icon-folder',
    file: 'icon-doc-text',
    home: 'icon-home',
    users: 'icon-users',
    collections: 'icon-sitemap',
    image: 'icon-file-image',
    javascript: 'icon-file-code',
    xml: 'icon-file-code',
    pdf: 'icon-file-pdf'
      
  }, options.iconMap);

  var lock = false;
  var icon = function (evt, data) {
    var model = data.node.data.model || {};
    var modelType = data.node.data.root || model._modelType;

    if (modelType === 'file') {
      switch (model.mimeType) {
        case 'application/json':
        case 'text/javascript':
          modelType = 'javascript';
          break;
        case 'application/xml':
        case 'text/xml':
        case 'text/html':
          modelType = 'xml';
          break;
        case 'image/jpeg':
        case 'image/png':
          modelType = 'image';
          break;
        case 'application/pdf':
          modelType = 'pdf';
          break;
      }
    }
    return options.icon(model) || iconMap[modelType];
  };

  function writeable(event, data) {
    return !lock && !!data.node.data.write;
  }

  // Get a reference to the user's recycle bin
  // for undoing delete operations.  This function
  // will create the folder if it doesn't already
  // exist.
  var recycleBinModel = null;
  var recycleBin = function () {
    var user;
    if (recycleBinModel) {
      return $.when(recycleBinModel);
    }

    return restRequest({
      url: api + '/user/me'
    }).then(function (me) {
      user = me;
      return restRequest({
        url: api + '/folder',
        data: {
          parentType: me._modelType,
          parentId: me._id,
          name: 'Recycle Bin'
        }
      }).then(function (folders) {
        if (!folders.length) {
          return restRequest({
            url: api + '/folder',
            method: 'POST',
            data: {
              parentType: user._modelType,
              parentId: user._id
            }
          });
        }
        return $.when(folders[0]);
      }).then(function (folder) {
        recycleBinModel = folder;
        return folder;
      });
    });
  };

  var glyph_opts = {
    map: $.extend({
      doc: "glyphicon glyphicon-file",
      docOpen: "glyphicon glyphicon-file",
      checkbox: "glyphicon glyphicon-unchecked",
      checkboxSelected: "glyphicon glyphicon-check",
      checkboxUnknown: "glyphicon glyphicon-share",
      dragHelper: "glyphicon glyphicon-play",
      dropMarker: "glyphicon glyphicon-arrow-right",
      error: "glyphicon glyphicon-warning-sign",
      expanderClosed: "glyphicon glyphicon-menu-right",
      expanderLazy: "glyphicon glyphicon-menu-right",  // glyphicon-plus-sign
      expanderOpen: "glyphicon glyphicon-menu-down",  // glyphicon-collapse-down
      folder: "glyphicon glyphicon-folder-close",
      folderOpen: "glyphicon glyphicon-folder-open",
      loading: "glyphicon glyphicon-refresh glyphicon-spin"
    }, options.glyph)
  };

  var dnd_opts = {
    autoExpandMS: 500,
    draggable: {
      revert: 'invalid'
    },
    dragStart: function (node, data) {
      return data.node.data.model._modelType in move &&
        writeable(node, data);
    },
    dragEnter: function (node, data) {
      return writeable(null, data) &&
        node.data.parentOf.indexOf(data.otherNode.data.model._modelType) >= 0 &&
        'over';
    },
    dragDrop: function (node, data) {
      lock = true;
      var model = data.otherNode.data.model;
      var newParent = data.node.data.model;
      var oldParent = data.otherNode.data.parent.model;
      move[model._modelType](model, oldParent, newParent)
        .then(function (undo) {
          console.log(undo); // eslint-disable-line no-console
          data.otherNode.moveTo(node, data.hitMode);
          lock = false;
          undoAlert(undo);
          return data.otherNode.makeVisible();
        }, function () {
          console.error('Move failed on ' + model._id); // eslint-disable-line no-console
          lock = false;
        });
    }
  };

  var persist_opts = {
    expandLazy: true,
    store: 'local'
  };

  var edit_opts = {
    adjustWidthOfs: 10,
    beforeEdit: writeable,
    save: function (event, data) {
      var newName = data.input.val();
      var oldName = data.node.data.model.name;

      lock = true;
      return rename(data.node.data.model, newName)
        .then(function () {
          data.node.data.model.name = newName;
          $(data.node.span).removeClass('pending'); // TODO add css to handle this
          lock = false;
        }, function () {
          data.node.setTitle(oldName);
          $(data.node.span).removeClass('pending');
          lock = false;
        });
    },
    close: function (event, data) {
      if (data.save) {
        $(data.node.span).addClass('pending');
      }
    }
  };

  // methods to recreate a deleted model for undo functionality
  var create = {
    folder: function (model) {
      return restRequest({
        url: api + '/folder',
        method: 'POST',
        data: {
          parentType: model.parentCollection,
          parentId: model.parentId,
          description: model.description,
          public: model.public
        }
      });
    },
    item: function (model) {
      return restRequest({
        url: api + '/item',
        method: 'POST',
        data: {
          folderId: model.folderId,
          name: model.name,
          description: model.description
        }
      });
    }
  };

  var move = {
    folder: function (model, oldParent, newParent) {

      return restRequest({
        url: api + '/folder/' + model._id,
        method: 'PUT',
        data: {
          parentId: newParent._id,
          parentType: newParent._modelType
        }
      }).then(function () {
        return {
          title: model.name + ' was moved.',
          rest: {
            url: api + '/folder/' + model._id,
            method: 'PUT',
            data: {
              parentId: oldParent._id,
              parentType: oldParent._modelType
            }
          }
        };
      });
    },
    item: function (model, oldParent, newParent) {

      return restRequest({
        url: api + '/item/' + model._id,
        method: 'PUT',
        data: {
          folderId: newParent._id
        }
      }).then(function () {
        return {
          title: model.name + ' was moved.',
          rest: {
            url: api + '/item/' + model._id,
            method: 'PUT',
            data: {
              foldertId: oldParent._id
            }
          }
        };
      });
    }
  };

  var rename = function (model, name) {
    var oldName = model.name;
    return restRequest({
      url: api + '/' + model._modelType + '/' + model._id,
      method: 'PUT',
      data: {
        name: name
      }
    }).then(function () {
      return {
        title: oldName + ' was renamed to ' + name,
        rest: {
          url: api + '/' + model._modelType + '/' + model._id,
          method: 'PUT',
          data: {
            name: oldName
          }
        }
      };
    });
  };

  var remove = function (model) {
    var data;
    var undo;
    return recycleBin().then(function (bin) {
      if (model._modelType === 'folder') {
        data = {
          parentType: 'folder',
          parentId: bin._id
        };
        undo = {
          parentType: model.parentCollection,
          parentId: model.parentId
        };
      } else if (model._modelType === 'item') {
        data = {
          folderId: bin._id
        };
        undo = {
          folderId: model.folderId
        };
      }
      return restRequest({
        url: api + '/' + model._modelType + '/' + model._id,
        method: 'PUT',
        data: data
      });
    }).then(function () {
      return {
        title: model.name + ' was deleted.',
        rest: {
          url: api + '/' + model._modelType + '/' + model._id,
          method: 'PUT',
          data: undo
        }
      };
    });
  };

  var process = {
    collection: function (model) {
      return {
        title: model.name,
        folder: true,
        key: model._id,
        write: model._accessLevel >= 1,
        lazy: true,
        rest: [{
          url: api + '/folder',
          data: {
            parentType: 'collection',
            parentId: model._id
          }
        }],
        model: model,
        parentOf: ['folder']
      };
    },
    folder: function (model, parent) {
      return {
        title: model.name,
        folder: true,
        key: model._id,
        write: model._accessLevel >= 1,
        lazy: true,
        rest: [{
          url: api + '/item',
          data: {
            folderId: model._id
          }
        }, {
          url: api + '/folder',
          data: {
            parentType: 'folder',
            parentId: model._id
          }
        }],
        model: model,
        parent: parent,
        parentOf: ['folder', 'item']
      };
    },
    item: function (model, parent) {
      return {
        title: model.name,
        folder: true,
        key: model._id,
        write: parent.write,
        lazy: true,
        rest: [{
          url: api + '/item/' + model._id + '/files'
        }],
        model: model,
        parent: parent,
        parentOf: ['file']
      };
    },
    file: function (model, parent) {
      return {
        title: model.name,
        write: parent.write,
        key: model._id,
        model: model,
        parent: parent,
        parentOf: []
      };
    },
    user: function (model) {
      return {
        title: model.login,
        folder: true,
        key: model._id,
        write: model._accessLevel >= 1,
        lazy: true,
        rest: [{
          url: api + '/folder',
          data: {
            parentType: 'user',
            parentId: model._id
          }
        }],
        tooltip: model.firstName + ' ' + model.lastName,
        model: model,
        parentOf: ['folder']
      };
    },
    _more: function (model) {
      return model;
    }
  };

  function postProcess(data, parent) {
    return data.map(function (model) {
        var node = process[model._modelType](model, parent);
        if (node.write) {
          node.extraClasses += ' gt-writeable';
        } else {
          node.extraClasses += ' gt-readonly';
        }
        if (node.model && node.model.description) {
          node.tooltip = node.model.description;
        }
        if (!node.tooltip) {
          node.tooltip = node.title;
        }
        return node;
    });
  }

  function nextPage(rest) {
    var params = $.extend({offset: 0, limit: pageSize}, rest.data);
    params.offset += pageSize;
    return $.extend({}, rest, {data: params});
  }

  function clickPaging(evt, data) {
    lazyLoad(evt, data);
    data.node.replaceWith(data.result);
  }

  function restRequest(rest) {
    var token = options.token || girder.currentToken;

    rest.method = rest.method || 'GET';
    rest.data = $.extend({}, rest.data || {});

    if (token) {
      $.extend(true, rest, {
        headers: {
          'Girder-Token': token
        }
      });
    }

    if (options.mockMutations && rest.method !== 'GET') {
      console.log(rest); // eslint-disable-line no-console
      return $.when({
        _id: 'deadbeef'
      });
    }
    return $.ajax(rest);
  }

  function lazyLoad(event, data) {
    var children = [];
    var promises = [];
    var parent = data.node.data.parent;

    promises = data.node.data.rest.map(function (rest) {

      rest.data = rest.data || {};
      rest.data.limit = pageSize;
      return restRequest(rest)
        .then(function (data) {
          Array.prototype.push.apply(children, data);
          if (data.length >= pageSize) {
            children.push({
              title: 'Load more...',
              statusNodeType: 'paging',
              icon: false,
              rest: [nextPage(rest)],
              _modelType: '_more',
              parentOf: [],
              model: {},
              parent: parent
            });
          }
        });
    });
    data.result = $.when.apply($, promises).then(function () {
      return postProcess(children, data.node.data);
    });
  }

  var extensions = ['glyph', 'hotkeys'];
  if (options.dragAndDrop) {
    extensions.push('dnd');
  }
  if (options.edit) {
    extensions.push('edit');
  }
  if (options.persist) {
    extensions.push('persist');
  }

  var source = $.ajax({
    url: api + '/user/me',
    headers: {
      'Girder-Token': options.token || girder.currentToken
    }
  }).then(function (data) {
    var sources = [];
    var home;

    if (data) {
      home = $.extend(
        process.user(data),
        {
          title: 'Home',
          root: 'home',
          tooltip: 'Home folder',
          parentOf: []
        }
      );
      sources.push(home);
    }
    sources.push({
      title: 'Collections',
      key: '2',
      folder: true,
      tooltip: 'All collections',
      lazy: true,
      rest: [{
        url: api + '/collection'
      }],
      root: 'collections',
      model: {},
      parentOf: []
    });

    sources.push({
      title: 'Users',
      key: '3',
      folder: true,
      tooltip: 'All users',
      lazy: true,
      rest: [{
        url: api + '/user',
        data: {
          sort: 'login'
        }
      }],
      root: 'users',
      model: {},
      parentOf: []
    });

    return sources;
  });

  var hotkeys = {
    keyup: {
      'del': function (node) {
        if (!node.data.root && writeable({}, {node: node})) {
          lock = true;
          remove(node.data.model)
            .then(function (undo) {
              console.log(undo); // eslint-disable-line no-console
              lock = false;
              node.remove();
              undoAlert(undo);
            }, function () {
              lock = false;
            });
        }
      }
    }
  };

  function undoAlert(obj) {
    return;
    $alert.empty().addClass('alert-warning alert-dismissible')
      .removeClass('hidden');

    var $undo = $('<button/>')
      .addClass('btn btn-default')
      .attr('href', '#')
      .html('<span class="icon-ccw"></span>Undo');

    var $dismiss = $('<button/>')
      .addClass('close')
      .attr('type', 'button')
      .attr('data-dismiss', 'alert')
      .append('<span>&times;</span>');

    var div = $('<div/>').appendTo($alert);
    div.append('<p class="">' + obj.title + '</p>').append($undo).append($dismiss);
  }

  return this.each(function () {
    var $el = $(this);

    $el.fancytree({
      extensions: extensions,
      source: source,
      lazyLoad: lazyLoad,
      postProcess: postProcess,
      glyph: glyph_opts,
      dnd: dnd_opts,
      persist: persist_opts,
      edit: edit_opts,
      focus: function (evt, data) {
        $el.trigger('g-focus', data.node);
      },
      icon: icon,
      clickPaging: clickPaging,
      hotkeys: hotkeys
    });
  });
};
