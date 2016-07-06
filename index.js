$.fn.girderTreeview = function (options) {
  options = options || {};
  var api = options.api || 'https://data.kitware.com/api/v1';

  var glyph_opts = {
    map: {
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
    }
  };

  var process = {
    collection: function (model) {
      return {
        title: model.name,
        folder: true,
        key: model._id,
        lazy: true,
        rest: [{
          url: api + '/folder',
          data: {
            parentType: 'collection',
            parentId: model._id
          }
        }]
      };
    },
    folder: function (model) {
      return {
        title: model.name,
        folder: true,
        key: model._id,
        lazy: true,
        rest: [{
          url: api + '/folder',
          data: {
            parentType: 'folder',
            parentId: model._id
          }
        }, {
          url: api + '/item',
          data: {
            folderId: model._id
          }
        }]
      };
    },
    item: function (model) {
      return {
        title: model.name,
        folder: true,
        key: model._id,
        lazy: true,
        rest: [{
          url: api + '/item/' + model._id + '/files'
        }]
      };
    },
    file: function (model) {
      return {
        title: model.name,
        key: model._id
      };
    },
    user: function (model) {
      return {
        title: model.login,
        folder: true,
        key: model._id,
        lazy: true,
        rest: [{
          url: api + '/folder',
          data: {
            parentType: 'user',
            parentId: model._id
          }
        }]
      };
    }
  };

  function postProcess(data) {
    return data.map(function (model) {
        return process[model._modelType](model);
    });
  }

  function lazyLoad(event, data) {
    var children = [];
    var promises = [];

    promises = data.node.data.rest.map(function (rest) {
      return $.ajax(rest)
        .then(function (data) {
            Array.prototype.push.apply(children, data);
        });
    });
    data.result = $.when.apply($, promises).then(function () {
      return postProcess(children);
    });
  }

  return this.each(function () {
    var $el = $(this);

    $el.fancytree({
      extensions: ['glyph'],
      source: [
        // {title: 'Home', key: '1', folder: true, lazy: true, url: api + '/user/me'},
        {title: 'Collections', key: '2', folder: true, lazy: true, rest: [{url: api + '/collection'}]},
        {title: 'Users', key: '3', folder: true, lazy: true, rest: [{url: api + '/user', data: {sort: 'login'}}]}
      ],
      lazyLoad: lazyLoad,
      postProcess: postProcess,
      glyph: glyph_opts
    });
  });
};
