module.exports = {
  "source": {
    "include": ["src/js", "src/tribute", "config/default.js"],
  },
  "opts": {
    "template": "node_modules/docdash",
    "destination": "dist/docs/",
    "recurse": true,
  },
  "plugins": [
    "plugins/markdown",
    "node_modules/jsdoc-tsimport-plugin/index.js",
  ],
  "templates": {
    "default": {
      // Template with a changed generation date format compared to the docdash (and JSDoc) standard
      // and several style tweaks. Needs to be updated if the docdash's template gets updated.
      "layoutFile": "misc/jsdoc-layout.tmpl",

      "useLongnameInNav": true,
    },
  },
  "docdash": {
    "search": true,
    "collapse": true,
  },
};
