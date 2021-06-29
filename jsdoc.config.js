module.exports = {
  "source": {
    "include": ["src/js", "config/default.js"],
  },
  "opts": {
    "template": "node_modules/docdash",
    "destination": "dist/docs/",
  },
  "plugins": ["plugins/markdown"],
  "templates": {
    "default": {
      // Template with a changed generation date format compared to the docdash (and JSDoc) standard
      // and several style tweaks. Needs to be updated if the docdash's template gets updated.
      "layoutFile": "misc/layout.tmpl",
    },
  },
  "docdash": {
    "search": true,
    "collapse": true,
  },
};
