'use strict';

var gulp = require('gulp');
var browserify = require('browserify');
var babelify = require('babelify');
var watchify = require('watchify');
var source = require('vinyl-source-stream');
var notify = require('gulp-notify');
var moment = require('moment');

function now() {
  return moment().format('HH:mm:ss');
}

function bundle(b) {
  b
    .bundle()
    .on('error', notify.onError())
    .pipe(source('cd.js'))
    .pipe(gulp.dest('dist'));

  return b;
}

gulp.task('default', function () {
  var b = watchify(browserify(Object.assign({
    entries: ['./src/app.js'],
  }, watchify.args)))
    .transform('babelify', {
      presets: ['@babel/preset-env'],
      // plugin-proposal-function-bind responsible for private::methods
      plugins: [
        '@babel/plugin-proposal-class-properties',
        '@babel/plugin-proposal-function-bind',
        '@babel/plugin-transform-runtime',
        '@babel/plugin-transform-async-to-generator',
      ],
    })
    .transform('node-lessify', {
      textMode: true,
    })
    .on('update', () => bundle(b))
    .on('time', time => {
      console.log(now() + ' - Done in ' + (time / 1000).toFixed(1) + ' seconds');
    });

  return bundle(b);
});
