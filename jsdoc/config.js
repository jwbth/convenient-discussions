module.exports = {
  "source": {
    "include": ["src", "src/tribute", "config/default.js"],
  },
  "opts": {
    "template": "node_modules/docdash",
    "destination": "dist/docs/",
    "recurse": true,
  },
  "plugins": [
    "jsdoc/tsimport-plugin-tweaked.js",
    "plugins/markdown",
  ],
  "templates": {
    "default": {
      // Template with a changed generation date format compared to the docdash (and JSDoc) standard
      // and several style tweaks. Needs to be updated if the docdash's template gets updated.
      "layoutFile": "jsdoc/layout.tmpl",

      "useLongnameInNav": true,
    },
  },
  "docdash": {
    "search": true,
    "collapse": true,
  },
};
