// var webpack = require('webpack');

module.exports = {
  context: __dirname + '/src',
  entry: './index.js',
  output: {
    path: __dirname + '/dist',
    filename: 'girder-treeview.js'
  },
  module: {
    loaders: [{
      test: /\.css$/,
      include: /node_modules/,
      loader: 'style-loader!css-loader'
    }, {
      test: /\.(jpg|png)$/,
      loader: 'url-loader?limit=8192'
    }, {
      test: /\.woff(2)?(\?v=[0-9]\.[0-9]\.[0-9])?$/,
      loader: 'url-loader?limit=60000&mimetype=application/font-woff'
    }, {
      test: /\.(ttf|eot|svg)(\?v=[0-9]\.[0-9]\.[0-9])?$/,
      loader: 'url-loader?limit=60000',
      include: /fonts/
    }]
  },
  externals: {
    jquery: 'jQuery'
  }
};
