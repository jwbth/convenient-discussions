'use strict';

const gulp = require('gulp');
const browserify = require('browserify');
const babelify = require('babelify');
const watchify = require('watchify');
const source = require('vinyl-source-stream');
const buffer = require('vinyl-buffer');
const notify = require('gulp-notify');
const moment = require('moment');
const gulpif = require('gulp-if');
const uglify = require('gulp-uglify');
const argv = require('yargs').argv;

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
        ascii_only: true,  // Messes with \x01 \x02 \x03 \x04
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
