/**
 * @file Tweaked version of
 * {@link https://github.com/polyforest/jsdoc-tsimport-plugin jsdoc-tsimport-plugin}. The changes
 * are: to handle "default" imports correctly; to understand class exports. See
 * jsdoc-tsimport-plugin-tweaked.js.LICENSE.txt for the full text of the license.
 * @author https://github.com/nbilyk
 * @author https://github.com/bombitmanbomb
 * @author https://github.com/jwbth
 * @license Apache-2.0
 */

const path = require('path');
const fs = require('fs');
const env = require('jsdoc/env');

const absSrcDirs = env.opts._.map((iSrcDir) => path.join(env.pwd, iSrcDir));

/**
 * @typedef {object} FileEvent
 * @property {string} filename The name of the file.
 * @property {string} source The contents of the file.
 */

/**
 * @typedef {object} DocCommentFoundEvent
 * @property {string} filename The name of the file.
 * @property {string} comment The text of the JSDoc comment.
 * @property {number} lineno The line number.
 * @property {number} columnno The column number.
 */

/**
 * A regex to capture all doc comments.
 */
const docCommentsRegex = /\/\*\*\s*(?:[^*]|(?:\*(?!\/)))*\*\/([^\n]*\n(.+))?/g;

/**
 * Find the module name.
 */
const moduleNameRegex = /@module\s+([\w/]+)?/;

/**
 * Finds typedefs
 */
const typedefRegex = /@typedef\s*(?:\{[^}]*\})\s*([\w-$]*)/g;


/**
 * Finds a ts import.
 */
const importRegex = /import\(['"](@?[./_a-zA-Z0-9-$]*)(?:\.js)?['"]\)\.?([_a-zA-Z0-9-$]*)?/g;

const typeRegex = /\{[^}]*\}/g;

const identifiers = /([\w-$.]+)/g;

/**
 * @typedef {object} FileInfo
 * @property {string} filename
 * @property {?string} moduleId
 * @property {string[]} typedefs
 */

/**
 * A map of filenames to module ids.
 *
 * @type {Map<string, FileInfo>}
 */
const fileInfos = new Map();

/**
 * A map of moduleId to type definition ids.
 *
 * @type {Map<string, Set<string>>}
 */
const moduleToTypeDefs = new Map();

/**
 * A map of classId to type definition ids.
 *
 * @type {Map<string, Set<object>>}
 */
const classToTypeDefs = new Map();

/**
 * Retrieves and caches file information for this plugin.
 *
 * @param {string} filename
 * @param {?string} source
 * @returns {!FileInfo}
 */
function getFileInfo(filename, source = null) {
  const filenameNor = path.normalize(filename);
  if (fileInfos.has(filenameNor)) return fileInfos.get(filenameNor);
  const fileInfo = /** @type {FileInfo} */ ({
    moduleId: null, typedefs: [], filename: filenameNor,
  });

  const s = source || ((fs.existsSync(filenameNor)) ?
  fs.readFileSync(filenameNor).toString() : '');
  s.replace(docCommentsRegex, (comment, nextLine) => {
    if (!fileInfo.moduleId) {
      // Searches for @module doc comment
      const moduleNameMatch = comment.match(moduleNameRegex);
      if (moduleNameMatch) {
        if (!moduleNameMatch[1]) {
          // @module tag with no module name; calculate the implicit module id.
          const srcDir = absSrcDirs.find((iSrcDir) =>
            filenameNor.startsWith(iSrcDir));
          fileInfo.moduleId = noExtension(filenameNor)
            .slice(srcDir.length + 1).replace(/\\/g, '/');
        } else {
          fileInfo.moduleId = moduleNameMatch[1];
        }
      }
    }
    // Add all typedefs within the file.
    comment.replace(typedefRegex, (_substr, defName) => {
      fileInfo.typedefs.push({
        defName,
        isInner: true,
      });

      // jwbth: Tweak to add to classToTypeDefs
      const [, memberOf] = comment.match(/@memberof\s*([\w-$]*)/) || [];
      const isInner = Boolean(comment.match(/@inner\s*/));
      if (memberOf) {
        if (!classToTypeDefs.has(memberOf)) {
          classToTypeDefs.set(memberOf, new Set());
        }
        classToTypeDefs.get(memberOf).add({ defName, isInner });
      }

      return '';
    });

    // jwbth: Sneak classes as typedefs as well to have correct links to them formed.
    nextLine?.replace(/\bexport class ([\w-$]+)/, (_substr, defName) => {
      fileInfo.typedefs.push({
        defName,
        isInner: false,
      });
    });

    return '';
  });
  if (!fileInfo.moduleId) {
    fileInfo.moduleId = '';
  }

  // Keep a list of typedefs per module.
  if (!moduleToTypeDefs.has(fileInfo.moduleId)) {
    moduleToTypeDefs.set(fileInfo.moduleId, new Set());
  }
  const typeDefsSet = moduleToTypeDefs.get(fileInfo.moduleId);
  fileInfo.typedefs.forEach((item) => {
    typeDefsSet.add(item);
  });

  fileInfos.set(filenameNor, fileInfo);
  return fileInfo;
}


/**
 * The beforeParse event is fired before parsing has begun.
 *
 * @param {FileEvent} e The event.
 */
function beforeParse(e) {
  getFileInfo(e.filename, e.source);

  // Find all doc comments (unfortunately needs to be done here and not
  // in jsDocCommentFound or there will be errors)
  e.source = e.source.replace(docCommentsRegex,
    (substring) => {
      return substring.replace(importRegex,
        (_substring2, relImportPath, symbolName) => {
        const moduleId = getModuleId(e.filename, relImportPath);
        if (symbolName === 'default') {
          return (moduleId) ?
            `module:${moduleId}` :
            path.basename(relImportPath, path.extname(relImportPath));
        }

        // jwbth: Added nearly the same fragment as in jsdocCommentFound()
        if (moduleId) {
          if (symbolName) {
            const moduleTypeDefsSet = moduleToTypeDefs.get(moduleId);
            const foundDefInModule = findTypeDef(symbolName, moduleTypeDefsSet);
            return `module:${moduleId}${!foundDefInModule || foundDefInModule.isInner ? '~' : '.'}${symbolName}`;
          }
          return `module:${moduleId}`;
        } else {
          return symbolName;
        }
      });
    });
}

/**
 * Converts a relative path to a module identifier.
 *
 * @param {string} filename The normalized path of the file doing the import.
 * @param {string} relImportPath The import string.
 * @returns {string} The module id.
 */
function getModuleId(filename, relImportPath) {
  if (!relImportPath.startsWith('.')) {
    // Not a relative import.
    return relImportPath;
  }

  const p = relPath(filename, relImportPath);
  const absPath = inferExtension(p);
  return getFileInfo(absPath).moduleId;
}

/**
 * Returns the normalized, absolute path of `relative` to `root.
 *
 * @param {string} root
 * @param {string} relative
 * @returns {string}
 */
function relPath(root, relative) {
  if (path.isAbsolute(relative)) return relative;
  return path.normalize(
    path.join(path.dirname(root), relative));
}

/**
 * Given a filename, if there is no extension, scan the files for the
 * most likely match.
 *
 * @param {string} filename The filename with or without an
 * extension to resolve.
 * @returns {string} The path to the resolved file.
 */
function inferExtension(filename) {
  const filenameNor = path.normalize(filename);
  const ext = path.extname(filenameNor);
  if (ext && fs.existsSync(filename)) return ext;
  const files = fs.readdirSync(path.dirname(filenameNor));

  const name = path.basename(filenameNor);
  const foundFile = files.find((iFile) => {
    if (noExtension(iFile) == name) {
      return true;
    }
  });
  if (foundFile === undefined) return filename;
  return path.join(path.dirname(filenameNor), foundFile);
}

/**
 * Strips the extension off of a filename.
 *
 * @param {string} filename A filename with or without an extension.
 * @returns {string} Returns the filename without extension.
 */
function noExtension(filename) {
  return filename.substring(0, filename.length - path.extname(filename).length);
}

/**
 * Find a type definition for an identifier in the list of type definitions for current file.
 *
 * @param {string} identifier
 * @param {string} typeDefs
 * @returns {object|undefined}
 */
function findTypeDef(identifier, typeDefs) {
  if (!typeDefs) return;

  for (const typeDef of typeDefs) {
    if (typeDef.defName === identifier) {
      return typeDef;
    }
  }
}

/**
 * The jsdocCommentFound event is fired whenever a JSDoc comment is found.
 * All file infos are now populated; replace typedef symbols with their
 * module counterparts.
 *
 * @param {DocCommentFoundEvent} e The event.
 */
function jsdocCommentFound(e) {
  const fileInfo = getFileInfo(e.filename);
  const moduleTypeDefsSet = moduleToTypeDefs.get(fileInfo.moduleId);

  const basename = path.basename(e.filename);
  const className = basename.slice(0, basename.includes('.') ? basename.indexOf('.') : undefined);
  const classTypeSetDefs = classToTypeDefs.get(className);

  if (!moduleTypeDefsSet && !classTypeSetDefs) return;

  e.comment = e.comment.replace(typeRegex, (typeExpr) => {
    return typeExpr.replace(identifiers, (identifier) => {
      // jwbth: Reworked this function to capture more situations.
      const foundDefInClassFile = findTypeDef(identifier, classTypeSetDefs);
      if (foundDefInClassFile) {
        return `${className}${foundDefInClassFile.isInner ? '~' : '.'}${identifier}`;
      }

      if (fileInfo.moduleId) {
        const foundDefInModule = findTypeDef(identifier, moduleTypeDefsSet);
        return foundDefInModule ?
          `module:${fileInfo.moduleId}${foundDefInModule.isInner ? '~' : '.'}${identifier}` :
          identifier;
      } else {
        return identifier;
      }
    });
  });
}


exports.handlers = {
  beforeParse: beforeParse,
  jsdocCommentFound: jsdocCommentFound,
};
