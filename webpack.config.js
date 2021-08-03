const path = require('path');

const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');
const WebpackBuildNotifierPlugin = require('webpack-build-notifier');
const BannerWebpackPlugin = require('banner-webpack-plugin');
require('json5/lib/register.js');

const config = require('./config.json5');
const getUrl = require('./misc/util.js').getUrl;

module.exports = (env) => {
  /*
    Production builds are created by running
      npm run build

    Development builds are for debugging locally. Create them like this:
      npm run start (which runs "webpack serve --env dev")
      npm run build --dev (which runs "webpack" and sets the "dev" npm config variable)
    (the first command will not create the files themselves but serve at the specified paths).
   */
  const dev = Boolean(env.dev || process.env.npm_config_dev);

  /*
    Test builds are for creating the production build with files (main file and configuration file)
    having the "-test" postfix. They are created by running
      npm run build --test
   */
  const test = Boolean(env.test || process.env.npm_config_test);

  /*
    Single builds include the main file, configuration and localization, as well as source maps, in
    a single file. Create them like this:
      npm run single -- project=w lang=en
   */
  const single = Boolean(env.single || process.env.npm_config_single);

  let filenamePostfix = '';
  let lang;
  let wiki;
  if (single) {
    const project = env.project || 'w';
    const interlanguageProjects = ['w', 'b', 'n', 'q', 's', 'v', 'voy', 'wikt'];
    lang = env.lang || 'en';
    wiki = interlanguageProjects.includes(project) ? `${project}-${lang}` : project;
    filenamePostfix = `-single-${wiki}`;
  } else if (dev) {
    filenamePostfix = '-dev';
  } else if (test) {
    filenamePostfix = '-test';
  }
  const filename = `convenientDiscussions${filenamePostfix}.js`;
  const sourceMapExt = '.map.json';

  if (!config.protocol || !config.server || !config.rootPath || !config.articlePath) {
    throw new Error('No protocol/server/root path/article path found in config.json5.');
  }

  let devtool;
  if (single) {
    devtool = 'eval';
  } else if (dev) {
    devtool = 'eval-source-map';
  } else {
    // SourceMapDevToolPlugin is used.
    devtool = false;
  }

  const progressPlugin = new webpack.ProgressPlugin();

  const plugins = [
    new webpack.DefinePlugin({
      IS_TEST: test,
      IS_SINGLE: single,
      CONFIG_FILE_NAME: single ? JSON.stringify(wiki) : null,
      LANG_CODE: single ? JSON.stringify(lang) : null,
    }),
    new WebpackBuildNotifierPlugin({
      suppressSuccess: true,
      suppressWarning: true,
    }),
  ];

  if (single) {
    plugins.push(progressPlugin);
  } else {
    plugins.push(
      new webpack.BannerPlugin({
        banner: '<nowiki>',

        // Don't add the banner to the inline worker.
        test: filename,
      }),

      // We can't use BannerWebpackPlugin for both the code to prepend and append, because if we add
      // the code to prepend with BannerWebpackPlugin, the source maps would break.
      // `webpack.BannerPlugin`, on the other hand, handles this, but doesn't have an option for the
      // code to append to the build (this code doesn't break the source maps).
      new BannerWebpackPlugin({
        chunks: {
          main: {
            afterContent: '\n/*! </nowiki> */',
          },
        },
      }),
    );
    if (!dev) {
      const sourceMapUrl = getUrl(`${config.rootPath}/[url]`, {
        action: 'raw',
        ctype: 'application/json',
      }).replace(/%5Burl%5D/, '[url]');
      plugins.push(
        new webpack.SourceMapDevToolPlugin({
          filename: `[file]${sourceMapExt}`,
          append: `\n//# sourceMappingURL=${sourceMapUrl}`,
        }),
      );
    }
    if (!process.env.CI) {
      plugins.push(progressPlugin);
    }
  }

  return {
    mode: dev || single ? 'development' : 'production',
    entry: './src/js/app.js',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename,
    },
    performance: {
      hints: false,
    },
    devtool,
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
          },
        },
        {
          test: /\.less$/,
          use: [
            'style-loader',
            'css-loader',
            {
              loader: 'postcss-loader',
              options: {
                plugins: [
                  require('cssnano')(),
                ],
              },
            },
            'less-loader',
          ],
        },
        {
          test: /\bworker-gate\.js$/,
          use: {
            loader: 'worker-loader',
            options: {
              filename: `convenientDiscussions-worker${filenamePostfix}.js`,
              inline: 'no-fallback',
            },
          },
        },
      ],
    },
    optimization: {
      // Less function calls when debugging, but one scope for all modules. To change this, "!dev"
      // could be used.
      concatenateModules: true,

      minimizer: [
        new TerserPlugin({
          terserOptions: {
            // This provides better debugging (less places where you can't set a breakpoint) while
            // costing not so much size.
            compress: {
              // + 0.3% to the file size
              sequences: false,

              // + 1% to the file size
              conditionals: false,
            },

            output: {
              // Otherwise messes with \x01 \x02 \x03 \x04.
              ascii_only: true,

              comments: /^\**!/,
            },
            mangle: {
              keep_classnames: true,
              reserved: ['cd'],
            },
          },
          extractComments: {
            // Removed "\**!|" at the beginning to not extract the <nowiki> comment.
            condition: /@preserve|@license|@cc_on/i,

            filename: (filename) => `${filename}.LICENSE.js`,
            banner: (licenseFile) => `
 * For documentation and feedback, see the script's homepage:
 *   https://commons.wikimedia.org/wiki/User:Jack_who_built_the_house/Convenient_Discussions
 * For license information, see
 *   ${getUrl(config.rootPath + '/' + licenseFile)}
`,
          },
          sourceMap: true,
        }),
      ],
    },
    plugins,
    devServer: {
      contentBase: path.join(__dirname, 'dist'),
      port: 9000,
      liveReload: false,

      // Fixes "GET https://localhost:9000/sockjs-node/info?t=... net::ERR_SSL_PROTOCOL_ERROR".
      public: '127.0.0.1:9000',

      // Fixes "Invalid Host/Origin header".
      disableHostCheck: true,

      // To use in a DevTools snippet.
      writeToDisk: single,
    },
  };
};
