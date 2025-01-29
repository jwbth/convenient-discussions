/**
 * Tribute.js
 * Native ES6 JavaScript @mention Plugin
 * Improved and adapted for use in the Convenient Discussions script. (There shoudln't be
 * any hardcode related to CD here.)
 *
 * @license
 * The MIT License (MIT)
 *
 * Copyright (c) 2020 Jack who built the house
 * Copyright (c) 2017-2020 ZURB, Inc.
 * Copyright (c) 2014 Jeff Collins
 * Copyright (c) 2012 Matt York
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 * and associated documentation files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or
 * substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
 * BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 * DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 **/

import TributeEvents from "./TributeEvents";
import TributeMenuEvents from "./TributeMenuEvents";
import TributeRange from "./TributeRange";
import TributeSearch from "./TributeSearch";

/**
 * @typedef {object} SearchOptions
 * @property {string} [pre]
 * @property {string} [post]
 * @property {boolean} [skip]
 */

/**
 * @typedef {object} TransformData
 * @property {string} start
 * @property {string} end
 * @property {string} [content]
 * @property {string} [name]
 * @property {() => boolean} [usePipeTrickCheck]
 * @property {() => void} [cmdModify]
 * @property {() => void} [shiftModify]
 * @property {boolean} [enterContent]
 */

/**
 * @typedef {object} ValuesReturn
 * @property {string} key
 * @property {any} item
 * @property {(value: any) => TransformData} transform
 */

/**
 * @typedef {object} TributeItem
 * @property {string} string
 * @property {number} score
 * @property {number} index
 * @property {any} original
 */

/**
 * @typedef {object} TributeCollection
 * @property {string} label
 * @property {(
 *   text: string,
 *   callback: (arr: any[]) => ValuesReturn[]
 * ) => void} values
 * @property {string} [trigger]
 * @property {SearchOptions} [searchOpts]
 * @property {boolean} [requireLeadingSpace]
 * @property {(item: TributeItem) => string} [selectTemplate]
 * @property {RegExp} [keepAsEnd]
 * @property {boolean} [replaceEnd]
 * @property {string} [selectClass]
 * @property {string} [containerClass]
 * @property {string} [itemClass]
 * @property {(item: TributeItem) => string} [menuItemTemplate]
 * @property {string} [lookup]
 * @property {string} [fillAttr]
 * @property {number|null} [menuItemLimit]
 * @property {number} [menuShowMinLength]
 */

/**
 * @typedef {object} TributeConfig
 * @property {string} [selectClass='highlight']
 * @property {string} [containerClass='tribute-container']
 * @property {string} [itemClass='']
 * @property {string} [trigger='@']
 * @property {string} [lookup='key']
 * @property {string} [fillAttr='value']
 * @property {TributeCollection[]|null} [collection=null]
 * @property {HTMLElement|null} [menuContainer=null]
 * @property {string|((value: string) => string | null)|null} [noMatchTemplate=null]
 * @property {boolean} [allowSpaces=false]
 * @property {string|null} [replaceTextSuffix=null]
 * @property {boolean} [positionMenu=true]
 * @property {object} [searchOpts={}]
 * @property {number|null} [menuItemLimit=null]
 * @property {number} [menuShowMinLength=0]
 * @property {'ltr'|'rtl'} [direction='ltr']
 */

class Tribute {
  constructor(/** @type {TributeConfig} */ {
    selectClass = "highlight",
    containerClass = "tribute-container",
    itemClass = "",
    trigger = "@",
    lookup = "key",
    fillAttr = "value",
    collection = null,
    menuContainer = null,
    noMatchTemplate = null,
    allowSpaces = false,
    replaceTextSuffix = null,
    positionMenu = true,
    searchOpts = {},
    menuItemLimit = null,
    menuShowMinLength = 0,
    direction = 'ltr'
  }) {
    this.menuSelected = 0;
    this.current = {};
    this.inputEvent = false;
    this.isActive = false;
    this.menuContainer = menuContainer;
    this.allowSpaces = allowSpaces;
    this.replaceTextSuffix = replaceTextSuffix;
    this.positionMenu = positionMenu;
    this.hasTrailingSpace = false;
    this.direction = direction;

    if (!collection) {
      throw new Error("[Tribute] No collection specified.");
    }

    this.collection = collection.map(item => {
      return {
        trigger: item.trigger || trigger,
        keepAsEnd: item.keepAsEnd || null,
        replaceEnd: item.replaceEnd === undefined ? true : item.replaceEnd,
        selectClass: item.selectClass || selectClass,
        containerClass: item.containerClass || containerClass,
        itemClass: item.itemClass || itemClass,
        selectTemplate: (
          item.selectTemplate || Tribute.defaultSelectTemplate
        ).bind(this),
        menuItemTemplate: (
          item.menuItemTemplate || Tribute.defaultMenuItemTemplate
        ).bind(this),
        // function called when menu is empty, disables hiding of menu.
        noMatchTemplate: (t => {
          if (typeof t === "string") {
            if (t.trim() === "") return null;
            return t;
          }
          if (typeof t === "function") {
            return t.bind(this);
          }

          return (
            noMatchTemplate ||
            function() {
              return "<li>No Match Found!</li>";
            }.bind(this)
          );
        })(noMatchTemplate),
        lookup: item.lookup || lookup,
        fillAttr: item.fillAttr || fillAttr,
        values: item.values,
        requireLeadingSpace: item.requireLeadingSpace,
        searchOpts: item.searchOpts || searchOpts,
        menuItemLimit: item.menuItemLimit || menuItemLimit,
        menuShowMinLength: item.menuShowMinLength || menuShowMinLength,
        label: item.label,
      };
    });

    new TributeRange(this);
    new TributeEvents(this);
    new TributeMenuEvents(this);
    new TributeSearch(this);
  }

  get isActive() {
    return this._isActive;
  }

  set isActive(val) {
    if (this._isActive != val) {
      this._isActive = val;
      if (this.current.element) {
        let noMatchEvent = new CustomEvent(`tribute-active-${val}`);
        this.current.element.dispatchEvent(noMatchEvent);
      }
    }
  }

  static defaultSelectTemplate(item) {
    if (typeof item === "undefined")
      return `${this.current.collection.trigger}${this.current.mentionText}`;

    return (
      this.current.collection.trigger +
      item.original[this.current.collection.fillAttr]
    );
  }

  static defaultMenuItemTemplate(matchItem) {
    return matchItem.string;
  }

  static inputTypes() {
    return ["TEXTAREA", "INPUT"];
  }

  triggers() {
    return this.collection.map(config => {
      return config.trigger;
    });
  }

  attach(el) {
    if (!el) {
      throw new Error("[Tribute] Must pass in a DOM node or NodeList.");
    }

    // Check if it is a jQuery collection
    if (typeof $ !== "undefined" && el instanceof $) {
      el = /** @type {JQuery} */ (el).get();
    }

    // Is el an Array/Array-like object?
    if (
      el.constructor === NodeList ||
      el.constructor === HTMLCollection ||
      el.constructor === Array
    ) {
      let length = el.length;
      for (var i = 0; i < length; ++i) {
        this._attach(el[i]);
      }
    } else {
      this._attach(el);
    }
  }

  _attach(el) {
    if (el.hasAttribute("data-tribute")) {
      console.warn("Tribute was already bound to " + el.nodeName);
    }

    this.events.bind(el);
    el.setAttribute("data-tribute", true);
  }

  createMenu(containerClass) {
    let wrapper = document.createElement("div"),
      ul = document.createElement("ul");
    wrapper.className = containerClass;

    if (this.direction === 'rtl') {
      wrapper.className += ' tribute-rtl';
    }

    wrapper.appendChild(ul);

    if (this.menuContainer) {
      return this.menuContainer.appendChild(wrapper);
    }

    return document.body.appendChild(wrapper);
  }

  showMenuFor(element, scrollTo) {
    const processValues = values => {
      // Tribute may not be active any more by the time the value callback returns
      if (!this.isActive) {
        return;
      }

      let items = this.search.filter(this.current.mentionText, values, {
        // jwbth: Replaced "<span>" and "</span>" as default values with empty strings. Tags are
        // displayed as plain text currently anyway.
        pre: this.current.collection.searchOpts.pre || "",
        post: this.current.collection.searchOpts.post || "",
        skip: this.current.collection.searchOpts.skip,
        extract: el => {
          if (typeof this.current.collection.lookup === "string") {
            return el[this.current.collection.lookup];
          } else if (typeof this.current.collection.lookup === "function") {
            return this.current.collection.lookup(el, this.current.mentionText);
          } else {
            throw new Error(
              "Invalid lookup attribute, lookup must be string or function."
            );
          }
        }
      });

      if (this.current.collection.menuItemLimit) {
        items = items.slice(0, this.current.collection.menuItemLimit);
      }

      this.current.filteredItems = items;

      let ul = this.menu.querySelector("ul");

      this.range.positionMenuAtCaret(scrollTo);

      if (!items.length) {
        let noMatchEvent = new CustomEvent("tribute-no-match", {
          detail: this.menu
        });
        this.current.element.dispatchEvent(noMatchEvent);
        if (
          (typeof this.current.collection.noMatchTemplate === "function" &&
            !this.current.collection.noMatchTemplate()) ||
          !this.current.collection.noMatchTemplate
        ) {
          this.hideMenu();
        } else {
          typeof this.current.collection.noMatchTemplate === "function"
            ? (ul.innerHTML = this.current.collection.noMatchTemplate())
            : (ul.innerHTML = this.current.collection.noMatchTemplate);
        }

        return;
      }

      ul.innerHTML = "";
      let fragment = document.createDocumentFragment();

      // jwbth: Added this part.
      if (this.current.collection.label) {
        let li = document.createElement("li");
        li.classList.add('tribute-label');
        li.textContent = this.current.collection.label;
        fragment.appendChild(li);
      }

      items.forEach((item, index) => {
        let li = document.createElement("li");
        li.setAttribute("data-index", index);

        // jwbth: Replaced this part.
        li.classList.add('tribute-item');
        if (this.current.collection.itemClass) {
          li.classList.add(this.current.collection.itemClass);
        }

        li.addEventListener("mousemove", e => {
          let [, index] = this._findLiTarget(e.target);
          if (e.movementY !== 0) {
            this.events.setActiveLi(index);
          }
        });
        if (this.menuSelected === index) {
          li.classList.add(this.current.collection.selectClass);
        }
        // jwbth: Replaced innerHTML with textContent to prevent XSS injections.
        li.textContent = this.current.collection.menuItemTemplate(item);
        fragment.appendChild(li);
      });
      ul.appendChild(fragment);

      // jwbth: Added this line to make the menu redrawn immediately, not wait the setTimeout's
      // callback.
      this.range.positionMenuAtCaret(scrollTo);
    };

    // jwbth: Only proceed if the menu isn't already shown for the current element & mentionText.
    // This behavior has issues, see
    // https://github.com/jwbth/convenient-discussions/commit/14dc20cf1b23dff79c2592ff47431513890ab213,
    // so here we have even more workarounds. But otherwise `values` is called 3 times, Carl. That's
    // probably a problem of Tribute, but seems non-trivial to refactor it quickly.
    if (
      this.isActive &&
      this.current.element === element &&
      this.current.mentionText === this.snapshot.mentionText
    ) {
      if (this.current.element.selectionStart !== this.snapshot.selectionStart) {
        processValues([]);
      }
      return;
    }
    this.snapshot = {
      mentionText: this.current.mentionText,
      selectionStart: this.current.element?.selectionStart,
    };

    // create the menu if it doesn't exist.
    if (!this.menu) {
      this.menu = this.createMenu(this.current.collection.containerClass);
      element.tributeMenu = this.menu;
      this.menuEvents.bind(this.menu);
    }

    this.isActive = true;
    this.menuSelected = 0;
    this.lastCanceledTriggerChar = null;
    this.lastCanceledTriggerPos = null;

    if (!this.current.mentionText) {
      this.current.mentionText = "";
    }

    if (typeof this.current.collection.values === "function") {
      this.current.collection.values(this.current.mentionText, processValues);
    } else {
      processValues(this.current.collection.values);
    }
  }

  _findLiTarget(el) {
    if (!el) return [];
    const index = el.getAttribute("data-index");
    return !index ? this._findLiTarget(el.parentNode) : [el, index];
  }

  showMenuForCollection(element, collectionIndex) {
    if (element !== document.activeElement) {
      this.placeCaretAtEnd(element);
    }

    this.current.collection = this.collection[collectionIndex || 0];

    // jwbth: Added this to avert a JS error.
    this.current.trigger = this.current.collection.trigger;

    this.current.externalTrigger = true;
    this.current.element = element;

    // jwbth: Added this.
    this.current.triggerPos = element.selectionStart;

    if (!this.insertAtCaret(element, this.current.collection.trigger)) {
      this.showMenuFor(element);
    }
  }

  // TODO: make sure this works for inputs/textareas
  placeCaretAtEnd(el) {
    el.focus();
    if (
      typeof window.getSelection != "undefined" &&
      typeof document.createRange != "undefined"
    ) {
      var range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } else if (typeof document.body.createTextRange != "undefined") {
      var textRange = document.body.createTextRange();
      textRange.moveToElementText(el);
      textRange.collapse(false);
      textRange.select();
    }
  }

  insertAtCaret(textarea, text) {
    var scrollPos = textarea.scrollTop;
    var caretPos = textarea.selectionStart;

    textarea.focus();

    // jwbth: Preserve the undo/redo functionality in browsers that support it.
    const hasInsertedViaCommand = document.execCommand('insertText', false, text);
    if (!hasInsertedViaCommand) {
      var front = textarea.value.substring(0, caretPos);
      var back = textarea.value.substring(
        textarea.selectionEnd,
        textarea.value.length
      );
      textarea.value = front + text + back;
      caretPos += text.length;
      textarea.selectionStart = caretPos;
      textarea.selectionEnd = caretPos;
    }
    textarea.scrollTop = scrollPos;

    return hasInsertedViaCommand;
  }

  hideMenu() {
    if (this.menu) {
      this.menu.style.cssText = "display: none;";
      this.isActive = false;
      this.menuSelected = 0;
      this.current = {};
    }
  }

  selectItemAtIndex(index, originalEvent) {
    index = parseInt(index);
    if (typeof index !== "number" || isNaN(index)) return;
    let item = this.current.filteredItems[index];
    let data = this.current.collection.selectTemplate(item, originalEvent);
    if (data !== null) this.replaceText(data, originalEvent, item);
  }

  replaceText(data, originalEvent, item) {
    this.range.replaceTriggerText(data, true, true, originalEvent, item);
  }

  _append(collection, newValues, replace) {
    if (typeof collection.values === "function") {
      throw new Error("Unable to append to values, as it is a function.");
    } else if (!replace) {
      collection.values = collection.values.concat(newValues);
    } else {
      collection.values = newValues;
    }
  }

  append(collectionIndex, newValues, replace) {
    let index = parseInt(collectionIndex);
    if (typeof index !== "number")
      throw new Error("please provide an index for the collection to update.");

    let collection = this.collection[index];

    this._append(collection, newValues, replace);
  }

  appendCurrent(newValues, replace) {
    if (this.isActive) {
      this._append(this.current.collection, newValues, replace);
    } else {
      throw new Error(
        "No active state. Please use append instead and pass an index."
      );
    }
  }

  detach(el) {
    if (!el) {
      throw new Error("[Tribute] Must pass in a DOM node or NodeList.");
    }

    // Check if it is a jQuery collection
    if (typeof $ !== "undefined" && el instanceof $) {
      el = /** @type {JQuery} */ (el).get();
    }

    // Is el an Array/Array-like object?
    if (
      el.constructor === NodeList ||
      el.constructor === HTMLCollection ||
      el.constructor === Array
    ) {
      let length = el.length;
      for (var i = 0; i < length; ++i) {
        this._detach(el[i]);
      }
    } else {
      this._detach(el);
    }
  }

  _detach(el) {
    this.events.unbind(el);
    if (el.tributeMenu) {
      this.menuEvents.unbind(el.tributeMenu);
    }

    setTimeout(() => {
      el.removeAttribute("data-tribute");
      this.isActive = false;
      if (el.tributeMenu) {
        el.tributeMenu.remove();
      }
    });
  }
}

export default Tribute;
