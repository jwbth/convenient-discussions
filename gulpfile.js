'use strict';

var gulp = require('gulp');
var browserify = require('browserify');
var babelify = require('babelify');
var watchify = require('watchify');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var notify = require('gulp-notify');
var moment = require('moment');
var gulpif = require('gulp-if');
var uglify = require('gulp-uglify');
var argv = require('yargs').argv;

function now() {
  return moment().format('HH:mm:ss');
}

function bundle(b) {
  return b
    .bundle()
    .on('error', notify.onError())
    .pipe(source('cd.js'))
    .pipe(buffer())
    .pipe(gulpif(release, uglify({
      mangle: false,
      output: {
        ascii_only: true,
      },
    })))
    .pipe(gulp.dest('dist'));
}

const release = !!argv.release;

gulp.task('default', function () {
  const obj = {
    entries: ['./src/app.js'],
    ignoreWatch: ['**/node_modules/**'],
    poll: true,
  };
  if (!release) {
    Object.assign(obj, {
      plugin: [watchify],
    }, watchify.args);
  }
  const b = browserify(obj)
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
