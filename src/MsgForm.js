import Msg from './Msg';
import Section from './Section';

export default class MsgForm {
  #couldBeCloserClosing;
  #standardButtonsTotalWidth;
  #standardSubmitButtonLabel;
  #shortSubmitButtonLabel;

  constructor(mode, target) {
    this.mode = mode;
    this.target = target;

    let sectionHeading;
    if (this.target instanceof Section) {
      sectionHeading = this.target.heading;
    } else {
      sectionHeading = this.target.section && this.target.section.heading;
    }

    let tag, addOlClass;
    if (this.mode === 'replyInSection') {
      var parentTag = this.target.$replyButtonContainer.parent().prop('tagName');
      if (parentTag === 'OL') {
        addOlClass = true;
        tag = 'li';
      } else if (parentTag === 'UL') {
        tag = 'li';
      } else if (parentTag === 'DL') {
        tag = 'dd';
      } else {
        tag = 'div';
      }
    } else if (this.mode === 'addSubsection') {
      tag = 'div';
    } else {
      let $lastTagOfTarget = this.target.$elements.cdRemoveNonTagNodes().last();
      let lastTagOfTargetName = $lastTagOfTarget.prop('tagName');
      if (lastTagOfTargetName === 'LI') {
        if (!$lastTagOfTarget.parent().is('ol') || this.mode === 'edit') {
          tag = 'li';
        } else {
          tag = 'div';
        }
      } else if (lastTagOfTargetName === 'DD') {
        tag = 'dd';
      } else {
        tag = 'div';
      }
    }
    this.$element = $(document.createElement(tag))
      .addClass('cd-msgForm')
      .addClass('cd-msgForm-' + this.mode)
      .css('display', 'none');
    if (addOlClass) {
      this.$element.addClass('cd-msgForm-inNumberedList');
    }
    if (this.mode === 'reply' || (this.mode === 'replyInSection' && tag === 'div')) {
      this.$element.addClass('cd-msgLevel');
    }
    if (this.mode === 'edit' && this.target.isOpeningSection) {
      this.$element.addClass('cd-msgForm-msgOpeningSection');
    }
    if (this.mode === 'addSubsection') {
      this.$element.addClass('cd-msgForm-addSubsection-' + this.target.level);
    }

    this.$wrapper = $('<div>')
      .addClass('cd-msgForm-wrapper')
      .appendTo(this.$element);

    this.$form = $('<form>')
      .submit((e) => {
        e.preventDefault();
        this.submit();
      })
      .appendTo(this.$wrapper);

    this.$infoArea = $('<div>')
      .addClass('cd-infoArea')
      .prependTo(this.$wrapper);

    this.$previewArea = $('<div>')
      .addClass('cd-previewArea')
      .prependTo(this.$wrapper);

    this.targetMsg = this.getTargetMsg();

    this.summaryAltered = false;
    let defaultSummaryComponents = {
      section: sectionHeading ? '/* ' + sectionHeading + ' */ ' : '',
    };

    let formUserName = (msg, genitive) => {
      let to;
      if (msg.authorGender === undefined) {
        to = !genitive ? 'участнику' : 'участника';
        if (msg.isAuthorRegistered) {
          // Idea to avoid making requests every time: store most active users' genders in a variable.
          // Make a SQL query to retrieve them from time to time: see
          // https://quarry.wmflabs.org/query/24299.
          new mw.Api().get({
            action: 'query',
            list: 'users',
            ususers: msg.author,
            usprop: 'gender',
            formatversion: 2,
          })
            .done((data) => {
              let gender = data &&
                data.query &&
                data.query.users &&
                data.query.users[0] &&
                data.query.users[0].gender;

              if (gender) {
                msg.authorGender = gender;
                if (gender === 'female') {
                  updateDefaultSummary(true);
                }
              }
            })
            .fail((jqXHR, textStatus, errorThrown) => {
              console.error('Не удалось узнать пол участника(-цы) ' + this.targetMsg.author);
              console.log(jqXHR, textStatus, errorThrown);
            });
        }
      } else if (msg.authorGender === 'female') {
        to = !genitive ? 'участнице' : 'участницы';
      } else {
        to = !genitive ? 'участнику' : 'участника';
      }

      return to + ' ' + msg.author;
    };

    let generateDefaultSummaryDescription = () => {
      if (this.mode === 'edit' && this.target.isOpeningSection) {
        defaultSummaryComponents.section = '/* ' + this.headingInput.getValue() + ' */ ';
      }

      if (this.mode === 'reply') {
        if (this.target.isOpeningSection || this.target.level === 0) {
          defaultSummaryComponents.description = 'ответ';
        } else {
          if (this.target.author !== cd.env.CURRENT_USER) {
            defaultSummaryComponents.description = 'ответ ' + formUserName(this.targetMsg);
          } else {
            defaultSummaryComponents.description = 'дополнение';
          }
        }
      } else if (this.mode === 'edit') {
        if (!this.deleteCheckbox || !this.deleteCheckbox.isSelected()) {
          if (this.target.author === cd.env.CURRENT_USER) {
            if (this.target.parent) {
              if (this.target.parent.author === cd.env.CURRENT_USER) {
                defaultSummaryComponents.description = 'редактирование дополнения';
              } else {
                if (this.target.parent.isOpeningSection) {
                  defaultSummaryComponents.description = 'редактирование ответа';
                } else {
                  defaultSummaryComponents.description = 'редактирование ответа ' +
                    formUserName(this.target.parent);
                }
              }
            } else if (this.target.isOpeningSection) {
              defaultSummaryComponents.description = 'редактирование описания ';
              defaultSummaryComponents.description += this.target.section.level <= 2 ?
                'темы' : 'подраздела';
            } else {
              defaultSummaryComponents.description = 'редактирование сообщения';
            }
          } else {
            if (this.target.isOpeningSection) {
              defaultSummaryComponents.description = 'редактирование описания ';
              defaultSummaryComponents.description += this.target.section.level <= 2 ?
                'темы' : 'подраздела';
            } else {
              defaultSummaryComponents.description = 'редактирование сообщения ' +
                formUserName(this.target, true);
            }
          }
        } else {
          if (this.target.author === cd.env.CURRENT_USER) {
            if (this.target.parent) {
              if (this.target.parent.author === cd.env.CURRENT_USER) {
                defaultSummaryComponents.description = 'удаление дополнения';
              } else {
                if (this.target.parent.isOpeningSection) {
                  defaultSummaryComponents.description = 'удаление ответа';
                } else {
                  defaultSummaryComponents.description = 'удаление ответа ' +
                    formUserName(this.target.parent);
                }
              }
            } else if (this.target.isOpeningSection) {
              defaultSummaryComponents.description = 'удаление ';
              defaultSummaryComponents.description += this.target.section.level <= 2 ?
                'темы' : 'подраздела';
            } else {
              defaultSummaryComponents.description = 'удаление сообщения';
            }
          } else {
            if (this.target.isOpeningSection) {
              defaultSummaryComponents.description = 'удаление ';
              defaultSummaryComponents.description += this.target.section.level <= 2 ?
                'темы' : 'подраздела';
            } else {
              defaultSummaryComponents.description = 'удаление сообщения ' +
                formUserName(this.target, true);
            }
          }
        }
      } else if (this.mode === 'replyInSection') {
        if (!this.noIndentationCheckbox || !this.noIndentationCheckbox.isSelected()) {
          if (!this.targetMsg || this.targetMsg.isOpeningSection) {
            defaultSummaryComponents.description = 'ответ';
          } else {
            if (this.target.author !== cd.env.CURRENT_USER) {
              defaultSummaryComponents.description = 'ответ ' + formUserName(this.targetMsg);
            } else {
              defaultSummaryComponents.description = 'дополнение';
            }
          }
        } else {
          defaultSummaryComponents.description = 'дополнение';
        }
      } else if (this.mode === 'addSubsection') {
        defaultSummaryComponents.description = 'новый подраздел';
      }
    };

    let updateDefaultSummary = (generateDescription) => {
      if (this.summaryAltered) return;

      if (generateDescription) {
        generateDefaultSummaryDescription();
      }

      this.defaultSummary = defaultSummaryComponents.section + defaultSummaryComponents.description;

      let newSummary = this.defaultSummary;
      if ((this.mode === 'reply' || this.mode === 'replyInSection')) {
        let summaryFullMsgText = this.textarea.getValue().trim().replace(/\s+/g, ' ');

        if (summaryFullMsgText && summaryFullMsgText.length <= cd.env.SUMMARY_FULL_MSG_TEXT_LENGTH_LIMIT) {
          let projectedSummary = this.defaultSummary + ': ' + summaryFullMsgText + ' (-)';

          if (projectedSummary.length <= cd.env.ACTUAL_SUMMARY_LENGTH_LIMIT) {
            newSummary = projectedSummary;
          }
        }
      } else if (this.mode === 'addSubsection') {
        let summaryHeadingText = this.headingInput.getValue().trim();

        if (summaryHeadingText) {
          let projectedSummary = (this.defaultSummary + ': /* ' + summaryHeadingText + ' */')
            .replace('новый подраздел: /* Итог */', 'итог')
            .replace('новый подраздел: /* Предварительный итог */', 'предварительный итог')
            .replace('новый подраздел: /* Предытог */', 'предытог');
          if (projectedSummary.length <= cd.env.ACTUAL_SUMMARY_LENGTH_LIMIT) {
            newSummary = projectedSummary;
          }
        }
      }

      this.summaryInput.setValue(newSummary);
    };

    this.#couldBeCloserClosing = /^Википедия:К удалению/.test(cd.env.CURRENT_PAGE) &&
      this.mode === 'addSubsection' &&
      mw.config.get('wgUserGroups').includes('closer');

    if (this.mode === 'addSubsection' || (this.mode === 'edit' && this.target.isOpeningSection)) {
      if (this.mode === 'addSubsection' || this.target.section.level > 2) {
        this.headingInputPurpose = 'Название подраздела';
      } else {
        this.headingInputPurpose = 'Название темы';
      }

      this.headingInput = new OO.ui.TextInputWidget({
        placeholder: this.headingInputPurpose,
        classes: ['cd-headingInput'],
      });
      this.headingInput.$element.appendTo(this.$form);
      this.headingInput.on('change', (headingInputText) => {
        updateDefaultSummary(this.mode === 'edit');

        if (headingInputText.includes('{{')) {
          this.showWarning('Не используйте шаблоны в заголовках — это ломает ссылки на разделы.', 'dontUseTemplatesInHeadings');
        } else {
          this.hideWarning('dontUseTemplatesInHeadings');
        }
      });
    }

    // Array elements: text pattern, reaction, icon, class, additional condition.
    let textReactions = [
      {
        pattern: /~~\~/,
        message: 'Вводить <kbd>~~\~~</kbd> не нужно — подпись подставится автоматически.',
        icon: 'notice',
        class: 'sigNotNeeded',
      },
      {
        pattern: /<pre/,
        message: 'Теги <code>&lt;pre&gt;</code> ломают разметку обсуждений — используйте <code>&lt;source&gt;</code>.',
        icon: 'alert',
        class: 'dontUsePre'
      },
      {
        pattern: /\{\{(?:(?:subst|подст):)?ПИ2?\}\}/,
        messagee: 'Шаблон указания на статус подводящего итоги добавлять не нужно — он будет добавлен автоматически.',
        icon: 'notice',
        class: 'closerTemplateNotNeeded',
        checkFunc: () => {
          return this.#couldBeCloserClosing && headingInput.getValue().trim() === 'Итог';
        }
      },
    ];

    this.textarea = new OO.ui.MultilineTextInputWidget({
      value: '',
      autosize: true,
      rows: $.client.profile().name === 'firefox' ? 4 : 5,
      maxRows: 30,
      classes: ['cd-textarea'],
    });
    this.textarea.cdMsgForm = this;
    this.textarea.on('change', (textareaText) => {
      updateDefaultSummary();

      for (let i = 0; i < textReactions.length; i++) {
        if (textReactions[i].pattern.test(textareaText) &&
          (typeof textReactions[i].checkFunc !== 'function' || textReactions[i].checkFunc())
        ) {
          this.showInfo(textReactions[i].message, textReactions[i].icon, textReactions[i].class);
        } else {
          this.hideInfo(textReactions[i].class);
        }
      }
    });
    this.textarea.$element.appendTo(this.$form);

    this.$settings = $('<div>')
      .addClass('cd-msgFormSettings')
      .appendTo(this.$form);

    this.summaryInput = new OO.ui.TextInputWidget({
      maxLength: cd.env.ACTUAL_SUMMARY_LENGTH_LIMIT,
      placeholder: 'Описание изменений',
      classes: ['cd-summaryInput'],
    });
    this.summaryInput.$element.keypress((summaryInputContent) => {
      this.summaryAltered = true;
    }).appendTo(this.$settings);

    this.summaryInput.$input.codePointLimit(cd.env.ACTUAL_SUMMARY_LENGTH_LIMIT);
    mw.widgets.visibleCodePointLimit(this.summaryInput, cd.env.ACTUAL_SUMMARY_LENGTH_LIMIT);
    updateDefaultSummary(true);

    this.$summaryPreview = $('<div>')
      .addClass('cd-summaryPreview')
      .appendTo(this.$settings);

    if (this.mode === 'edit') {
      this.minorCheckbox = new OO.ui.CheckboxInputWidget({
        value: 'minor',
        selected: true,
      });
      this.minorCheckboxField = new OO.ui.FieldLayout(this.minorCheckbox, {
        label: 'Малое изменение',
        align: 'inline',
      });
    }

    this.watchCheckbox = new OO.ui.CheckboxInputWidget({
      value: 'watch',
      selected: !!mw.user.options.get('watchdefault') || !!$('#ca-unwatch').length,
    });
    this.watchCheckboxField = new OO.ui.FieldLayout(this.watchCheckbox, {
      label: 'В список наблюдения',
      align: 'inline',
    });

    this.watchTopicCheckbox = new OO.ui.CheckboxInputWidget({
      value: 'watchTopic',
      selected: this.mode !== 'edit' || this.targetMsg.section.isWatched,
    });
    this.watchTopicCheckboxField = new OO.ui.FieldLayout(this.watchTopicCheckbox, {
      label: 'Следить за темой',
      align: 'inline',
    });

    if (this.mode !== 'edit' && this.targetMsg) {
      this.pingCheckbox = new OO.ui.CheckboxInputWidget({
        value: 'ping',
      });
      this.pingCheckboxField = new OO.ui.FieldLayout(this.pingCheckbox, {
        align: 'inline',
      });
    }

    let updatePingCheckbox = () => {
      if (this.targetMsg.isAuthorRegistered) {
        if (this.targetMsg.author !== cd.env.CURRENT_USER) {
          this.pingCheckbox.setDisabled(false);
          this.pingCheckbox.setTitle(null);
          this.pingCheckboxField.setTitle('Функцией пинга');
        } else {
          this.pingCheckbox.setDisabled(true);
          this.pingCheckbox.setTitle('Невозможно послать уведомление самому себе');
          this.pingCheckboxField.setTitle('Невозможно послать уведомление самому себе');
        }
      } else {
        this.pingCheckbox.setDisabled(true);
        this.pingCheckbox.setTitle('Невозможно послать уведомление незарегистрированному участнику');
        this.pingCheckboxField.setTitle('Невозможно послать уведомление незарегистрированному участнику');
      }

      if (!this.noIndentationCheckbox || !this.noIndentationCheckbox.isSelected()) {
        this.pingCheckboxField.setLabel(
          this.targetMsg.isOpeningSection ? 'Уведомить автора темы' : 'Уведомить адресата'
        );
      } else {
        if (this.targetMsg) {
          this.pingCheckboxField.setLabel('Уведомить автора темы');
        } else {
          this.pingCheckbox.setSelected(false);
          this.pingCheckbox.setDisabled(true);
          this.pingCheckbox.setTitle('Не удалось определить автора темы');
          this.pingCheckboxField.setTitle('Не удалось определить автора темы');
        }
      }
    };

    if (this.mode !== 'addSubsection' &&
      !(this.mode === 'edit' && this.target.isOpeningSection)
    ) {
      this.smallCheckbox = new OO.ui.CheckboxInputWidget({
        value: 'small',
      });

      this.smallCheckboxField = new OO.ui.FieldLayout(this.smallCheckbox, {
        label: 'Мелким шрифтом',
        align: 'inline',
      });
    }

    if (this.mode === 'replyInSection') {
      this.noIndentationCheckbox = new OO.ui.CheckboxInputWidget({
        value: 'noIndentation',
      });
      this.noIndentationCheckbox.on('change', (selected) => {
        if (selected) {
          this.$element.addClass('cd-msgForm-noIndentation');
        } else {
          this.$element.removeClass('cd-msgForm-noIndentation');
        }
        this.targetMsg = this.getTargetMsg();
        if (this.pingCheckbox) {
          updatePingCheckbox();
        }
        updateDefaultSummary(true);
      });

      this.noIndentationCheckboxField = new OO.ui.FieldLayout(this.noIndentationCheckbox, {
        label: 'Без отступа',
        align: 'inline',
      });
    }
    if (this.pingCheckbox) {
      updatePingCheckbox();
    }

    if (this.mode === 'edit' &&
      (!this.target.isOpeningSection ||
        (this.target.section && this.target.section.msgs.length <= 1)
      )
    ) {
      if (!this.target.isOpeningSection && this.target.replies === undefined) {
        let replies = [];
        for (let i = this.target.id + 1; i < cd.msgs.length; i++) {
          if (cd.msgs[i].parent === this.target) {
            replies.push(cd.msgs[i]);
          }
        }
        this.target.replies = replies;
      }
      if (this.target.isOpeningSection ||
        (this.target.replies && !this.target.replies.length)
      ) {
        this.deleteCheckbox = new OO.ui.CheckboxInputWidget({
          value: 'delete',
        });
        let initialMinorSelected;
        this.deleteCheckbox.on('change', (selected) => {
          updateDefaultSummary(true);
          if (selected) {
            initialMinorSelected = this.minorCheckbox.isSelected();
            this.minorCheckbox.setSelected(false);
            this.textarea.setDisabled(true);
            if (this.headingInput) {
              this.headingInput.setDisabled(true);
            }
            this.minorCheckbox.setDisabled(true);
            if (this.smallCheckbox) {
              this.smallCheckbox.setDisabled(true);
            }
          } else {
            this.minorCheckbox.setSelected(initialMinorSelected);
            this.textarea.setDisabled(false);
            if (this.headingInput) {
              this.headingInput.setDisabled(false);
            }
            this.minorCheckbox.setDisabled(false);
            if (this.smallCheckbox) {
              this.smallCheckbox.setDisabled(false);
            }
          }
        });

        this.deleteCheckboxField = new OO.ui.FieldLayout(this.deleteCheckbox, {
          label: 'Удалить',
          align: 'inline',
        });
      }
    }

    this.horizontalLayout = new OO.ui.HorizontalLayout({
      classes: ['cd-checkboxesContainer'],
    });
    if (this.minorCheckboxField) {
      this.horizontalLayout.addItems([this.minorCheckboxField]);
    }
    this.horizontalLayout.addItems([this.watchCheckboxField]);
    if (this.pingCheckboxField) {
      this.horizontalLayout.addItems([this.pingCheckboxField]);
    }
    if (this.smallCheckboxField) {
      this.horizontalLayout.addItems([this.smallCheckboxField]);
    }
    if (this.noIndentationCheckboxField) {
      this.horizontalLayout.addItems([this.noIndentationCheckboxField]);
    }
    if (this.deleteCheckboxField) {
      this.horizontalLayout.addItems([this.deleteCheckboxField]);
    }

    this.horizontalLayout.$element.appendTo(this.$settings);

    if (this.mode !== 'edit' && !cd.settings.alwaysExpandSettings) {
      this.$settings.hide();
    }

    this.$buttonsContainer = $('<div>')
      .addClass('cd-buttonsContainer')
      .appendTo(this.$form);

    this.$leftButtonsContainer = $('<div>')
      .addClass('cd-leftButtonsContainer')
      .appendTo(this.$buttonsContainer);

    this.$rightButtonsContainer = $('<div>')
      .addClass('cd-rightButtonsContainer')
      .appendTo(this.$buttonsContainer);

    if (this.mode === 'edit') {
      this.#standardSubmitButtonLabel = 'Сохранить';
      this.#shortSubmitButtonLabel = 'Сохранить';
    } else if (this.mode === 'addSubsection') {
      this.#standardSubmitButtonLabel = 'Добавить подраздел';
      this.#shortSubmitButtonLabel = 'Добавить';
    } else {
      this.#standardSubmitButtonLabel = 'Ответить';
      this.#shortSubmitButtonLabel = 'Ответ';
    }

    this.submitButton = new OO.ui.ButtonInputWidget({
      type: 'submit',
      label: this.#standardSubmitButtonLabel,
      flags: ['progressive', 'primary'],
      classes: ['cd-submitButton'],
    });

    this.previewButton = new OO.ui.ButtonWidget({
      label: 'Предпросмотреть',
      classes: ['cd-previewButton'],
    });
    this.previewButton.on('click', this.preview.bind(this));

    if (this.mode === 'edit' || cd.config.debug) {
      this.viewChangesButton = new OO.ui.ButtonWidget({
        label: 'Просмотреть изменения',
        classes: ['cd-viewChangesButton'],
      });
      this.viewChangesButton.on('click', this.viewChanges.bind(this));
    }

    this.settingsButton = new OO.ui.ButtonWidget({
      label: 'Настройки',
      framed: false,
      classes: ['cd-settingsButton'],
    });
    this.settingsButton.on('click', this.toggleSettings.bind(this));

    if (!cd.env.$popupsOverlay) {
      cd.env.$popupsOverlay = $('<div>')
        .addClass('cd-popupsOverlay')
        .appendTo($('body'));
    }

    this.helpPopupButton = new OO.ui.PopupButtonWidget({
      label: '?',
      framed: false,
      popup: {
        head: true,
        label: 'Сочетания клавиш',
        $content: $('\
          <ul>\
          <li><b>Ctrl+Enter</b> — отправить\
          <li><b>Esc</b> — отменить\
          <li><b>Q</b> (<b>Ctrl+Alt+Q</b>) — цитировать\
          <li><b>Ctrl+Alt+W</b> — викифицировать\
          </ul>\
        '),
        padded: true,
        align: 'center',
      },
      $overlay: cd.env.$popupsOverlay,
    });

    this.cancelButton = new OO.ui.ButtonWidget({
      label: 'Отменить',
      flags: 'destructive',
      framed: false,
      classes: ['cd-cancelButton'],
    });
    this.cancelButton.on('click', this.cancel.bind(this));

    this.settingsButton.$element.appendTo(this.$leftButtonsContainer);
    this.helpPopupButton.$element.appendTo(this.$leftButtonsContainer);

    this.cancelButton.$element.appendTo(this.$rightButtonsContainer);
    if (this.viewChangesButton) {
      this.viewChangesButton.$element.appendTo(this.$rightButtonsContainer);
    }
    this.previewButton.$element.appendTo(this.$rightButtonsContainer);
    this.submitButton.$element.appendTo(this.$rightButtonsContainer);

    if (this.mode === 'reply') {
      let $last = this.target.$elements.last();
      if ($last.next().hasClass('cd-msgForm-edit')) {
        $last = $last.next();
      }
      this.$element.insertAfter($last);
    } else if (this.mode === 'edit') {
      // We insert the form before so that if the message end on the wrong level, the form was
      // on the right one.
      this.$element.insertBefore(this.target.$elements.first());
    } else if (this.mode === 'replyInSection') {
      this.$element.insertAfter(this.target.$replyButtonContainer);
    } else if (this.mode === 'addSubsection') {
      let $last = this.target.$elements.last();
      let headingLevelRegExp = new RegExp('\\bcd-msgForm-addSubsection-[' + this.target.level + '-6]\\b');
      let $nextToLast = $last.next();
      while ($nextToLast.hasClass('cd-replyButtonContainerContainer') ||
        $nextToLast.hasClass('cd-addSubsectionButtonContainer') ||
        ($nextToLast.hasClass('cd-msgForm') && !$nextToLast.hasClass('cd-msgForm-addSubsection')) ||
        ($nextToLast[0] && $nextToLast[0].className.match(headingLevelRegExp))
      ) {
        $last = $nextToLast;
        $nextToLast = $last.next();
      }
      this.$element.insertAfter($last);
    }

    // Keyboard shortcuts
    this.$form.keydown((e) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.keyCode === 13) {  // Ctrl+Enter
        e.preventDefault();

        this.submitButton.$button.focus();  // Blur text inputs in Firefox
        this.submit();
      }
      if (e.ctrlKey && !e.shiftKey && e.altKey && e.keyCode === 87) {  // Ctrl+Alt+W
        e.preventDefault();

        mw.loader.using('ext.gadget.wikificator').done(() => {
          Wikify(this.textarea.$input[0]);
        });
      }
      if (e.keyCode === 27) { // Esc
        e.preventDefault();

        this.cancelButton.$button.focus();  // Blur text inputs in Firefox
        this.cancel();
      }
    });

    // "focusin" is "focus" which bubbles, i.e. propagates up the node tree.
    this.$form.focusin(() => {
      cd.env.lastActiveMsgForm = this;
    });

    let retryLoad = () => {
      this.$element[this.mode === 'edit' ? 'cdFadeOut' : 'cdSlideUp']('fast', () => {
        this.destroy();
        this.target[this::modeToProperty(this.mode)]();
      }, this.getTargetMsg(true));
    };

    if (mode !== 'edit') {  // 'reply', 'replyInSection' or 'addSubsection'
      this.originalText = '';
      if (this.headingInput) {
        this.originalHeadingText = '';
      }

      // This is for test if the message exists.
      this.target.loadCode()
        .fail((e) => {
          let [errorType, data] = e;
          cd.env.genericErrorHandler.call(this, {
            errorType,
            data,
            retryFunc: retryLoad,
            message: 'Не удалось загрузить сообщение',
          });
        });
    } else {
      this.setPending(true, true);

      this.target.loadCode()
        .done((msgText, headingText) => {
          this.setPending(false, true);
          this.textarea.setValue(msgText);
          if (this.smallCheckbox) {
            this.smallCheckbox.setSelected(this.target.inCode.inSmallTag);
          }
          this.originalText = msgText;
          if (this.headingInput) {
            this.headingInput.setValue(headingText);
            this.originalHeadingText = headingText;
          }
          this.textarea.focus();
        })
        .fail((e) => {
          let [errorType, data] = e;
          cd.env.genericErrorHandler.call(this, {
            errorType,
            data,
            retryFunc: retryLoad,
            message: 'Не удалось загрузить сообщение',
          });
        });
    }

    mw.hook('cd.msgFormCreated').fire(this);
  }

  getTargetMsg(last = false, returnNextInViewport = false) {
    // By default, for sections, returns the first message in the section. If "last" parameter is set
    // to true, returns either the last message in the first section subdivision (i.e. the part of the
    // section up to the first heading) or the last message in the section, depending on MsgForm.mode. It is useful
    // for getting/updating underlayer positions before and after animations.

    let target = this.target;
    if (target instanceof Msg) {
      return target;
    } else if (target instanceof Section) {
      if (!last) {
        if (!this.noIndentationCheckbox || !this.noIndentationCheckbox.isSelected()) {
          for (let i = target.msgsInFirstSubdivision.length - 1; i >= 0; i--) {
            if (target.msgsInFirstSubdivision[i].level === 0) {
              return target.msgsInFirstSubdivision[i];
            }
          }
        }

        if (target.msgsInFirstSubdivision[0] && target.msgsInFirstSubdivision[0].isOpeningSection) {
          return target.msgsInFirstSubdivision[0];
        }
      } else {
        let msg;
        if (this.mode === 'replyInSection') {
          msg = target.msgsInFirstSubdivision[target.msgsInFirstSubdivision.length - 1];
        } else if (this.mode === 'addSubsection') {
          msg = target.msgs[target.msgs.length - 1];
        }
        if (msg) {
          return msg;
        }
      }
      // This is meaningful when the section has no messages in it.
      if (returnNextInViewport) {
        let firstMsg;
        for (let i = target.id + 1; i < cd.sections.length; i++) {
          firstMsg = cd.sections[i].msgs[0];
          if (firstMsg) {
            if (firstMsg.$elements.cdIsInViewport(true)) {
              return firstMsg;
            } else {
              return;
            }
          }
        }
      }
    }
  }

  show(fashion) {
    this.$element.removeClass('cd-msgForm-hidden');
    if (!fashion) {
      this.$element.cdShow(this.getTargetMsg(true));
    } else if (fashion === 'slideDown') {
      this.$element.cdSlideDown('fast', this.getTargetMsg(true));
    } else if (fashion === 'fadeIn') {
      this.$element.cdFadeIn('fast', this.getTargetMsg(true));
    }

    this.#standardButtonsTotalWidth = this.submitButton.$element.outerWidth(true) +
      this.previewButton.$element.outerWidth(true) +
      (this.viewChangesButton ? this.viewChangesButton.$element.outerWidth(true) : 0) +
      this.settingsButton.$element.outerWidth(true) +
      this.helpPopupButton.$element.outerWidth(true) +
      this.cancelButton.$element.outerWidth(true);

    this.correctLabels();
    this.summaryInput.emit('labelChange');  // Characters left count overlapping fix
  }

  toggleSettings() {
    if (this.$settings.css('display') === 'none') {
      this.$settings[cd.settings.slideEffects ? 'cdSlideDown' : 'cdFadeIn']('fast',
        this.getTargetMsg(true));
    } else {
      this.$settings[cd.settings.slideEffects ? 'cdSlideUp' : 'cdFadeOut']('fast', null,
        this.getTargetMsg(true));
    }
  }

  correctLabels() {
    let formWidth = this.$wrapper.width();

    if (formWidth < this.#standardButtonsTotalWidth + 7 &&
      !this.$element.hasClass('cd-msgForm-short')
    ) {
      this.$element.addClass('cd-msgForm-short');
      this.submitButton.setLabel(this.#shortSubmitButtonLabel);
      this.previewButton.setLabel('Просмотр');
      if (this.viewChangesButton) {
        this.viewChangesButton.setLabel('Изменения');
      }
      this.cancelButton.setLabel('Отмена');
    }
    if (formWidth >= this.#standardButtonsTotalWidth + 7 &&
      this.$element.hasClass('cd-msgForm-short')
    ) {
      this.$element.removeClass('cd-msgForm-short');
      this.submitButton.setLabel(this.#standardSubmitButtonLabel);
      this.previewButton.setLabel('Предпросмотреть');
      if (this.viewChangesButton) {
        this.viewChangesButton.setLabel('Просмотреть изменения');
      }
      this.cancelButton.setLabel('Отменить');
    }
  }

  setPending(status = false, blockButtons = false) {
    if (status) {
      this.textarea.pushPending();
      this.summaryInput.pushPending();
      if (this.headingInput) {
        this.headingInput.pushPending();
      }
    } else {
      this.textarea.popPending();
      this.summaryInput.popPending();
      if (this.headingInput) {
        this.headingInput.popPending();
      }
    }

    this.submitButton.setDisabled(status && blockButtons);
    this.previewButton.setDisabled(status && blockButtons);
    this.viewChangesButton.setDisabled(status && blockButtons);
  }

  showInfo(html, icon = 'info', class_) {
    if (!class_ || !this.$infoArea.children('.cd-info-' + class_).length) {
      let $textWithIcon = cd.env.createTextWithIcon(html, icon)
        .addClass('cd-info')
        .addClass('cd-info-' + icon);
      if (class_) {
        $textWithIcon.addClass('cd-info-' + class_);
      }

      this.$infoArea.cdAppend($textWithIcon, this.getTargetMsg(true));
    }
  }

  hideInfo(class_) {
    let $info = this.$infoArea.children('.cd-info-' + class_);
    if ($info.length) {
      $info.cdRemove(this.getTargetMsg(true));
    }
  }

  showWarning(html, class_) {
    this.showInfo(html, 'alert', class_);
  }

  hideWarning(class_) {
    this.hideInfo(class_);
  }

  abort(message, logMessage, retryFunc) {
    // Presence of retryFunc now implies the deletion of form elements.

    if (this.textarea.$element[0].parentElement) {
      this.setPending(false);
    }
    this.$previewArea.empty();
    this.showWarning(message);
    if (logMessage) {
      console.warn(logMessage);
    }

    if (retryFunc) {
      this.$wrapper.children(':not(.cd-infoArea)').remove();

      let cancelLink = new OO.ui.ButtonWidget({
        label: 'Отмена',
        framed: false,
      });
      cancelLink.on('click', () => {
        this.cancel({ leaveInfo: true });
      });

      let retryLink = new OO.ui.ButtonWidget({
        label: 'Попробовать ещё раз',
        framed: false,
      });
      retryLink.on('click', retryFunc);

      $('<div>')
        .append(cancelLink.$element, retryLink.$element)
        .cdAppendTo(this.$infoArea, this.getTargetMsg(true));
    }

    if (!this.$infoArea.cdIsInViewport()) {
      this.$infoArea.cdScrollTo('top');
    }
  }

  msgTextToCode(action) {
    let text = this.textarea.getValue();
    if (text === undefined) return;

    // Prepare indentation characters
    let indentationCharacters, replyIndentationCharacters;
    // If this is a preview, there's no point to look into the code.
    if (action !== 'preview' && this.targetMsg) {
      indentationCharacters = this.targetMsg.inCode && this.targetMsg.inCode.indentationCharacters;
      replyIndentationCharacters = this.targetMsg.inCode &&
        this.targetMsg.inCode.replyIndentationCharacters;
    }
    if (!indentationCharacters) {
      indentationCharacters = '';
    }
    let isZeroLevel = this.mode === 'addSubsection' ||
      this.noIndentationCheckbox && this.noIndentationCheckbox.isSelected() ||
      (this.mode === 'edit' && !indentationCharacters) ||
      action === 'preview';

    if (this.mode === 'reply' && action === 'submit') {
      indentationCharacters = replyIndentationCharacters;
    }

    if (this.mode === 'replyInSection') {
      if (this.target.inCode.lastMsgIndentationFirstCharacter) {
        indentationCharacters = this.target.inCode.lastMsgIndentationFirstCharacter;
      } else if (this.noIndentationCheckbox.isSelected()) {
        indentationCharacters = '';
      } else {
        indentationCharacters = '*';
      }
    }

    // Work with code
    let code = text
      .replace(/^[\s\uFEFF\xA0]+/g, '')  // trimLeft
      // Remove ending spaces from empty lines, only if they are not a part of a syntax creating <pre>.
      .replace(/^ +[\s\uFEFF\xA0]+[^\s\uFEFF\xA0]/gm, (s) => {
        if (/ [^\s\uFEFF\xA0]$/.test(s)) {
          return s;
        } else {
          return s.replace(/^ +/gm, '');
        }
      });

    let hasCloserTemplate = /\{\{(?:(?:subst|подст):)?ПИ2?\}\}|правах подводящего итоги/.test(code);

    let hidden = [];
    let makeAllIntoColons = false;
    let hide = (re, isTable) => {
      code = code.replace(re, (s) => {
        if (isTable && !isZeroLevel) {
          makeAllIntoColons = true;
        }
        return (!isTable ? '\x01' : '\x03') + hidden.push(s) + (!isTable ? '\x02' : '\x04');
      });
    };
    let hideTags = function () {
      for (let i = 0; i < arguments.length; i++) {
        hide(new RegExp('<' + arguments[i] + '( [^>]+)?>[\\s\\S]+?<\\/' + arguments[i] + '>', 'gi'));
      }
    };
    // Simple function for hiding templates which have no nested ones.
    hide(/\{\{([^{]\{?)+?\}\}/g);
    // Hide tables
    hide(/^\{\|[^]*?\n\|\}/gm, true);
    hideTags('nowiki', 'pre', 'source', 'syntaxhighlight');

    let sig;
    if (this.mode === 'edit') {
      sig = this.targetMsg.inCode.sig;
    }

    // So that the signature doesn't turn out to be at the end of the last item of the list, if the message
    // contains one.
    if ((this.mode !== 'edit' ||
        !/^[ \t]*\n/.test(sig)
      ) &&
      /\n[:\*#].*$/.test(code)
    ) {
      code += '\n';

      if (this.mode === 'edit') {
        if (/^\s*/.test(sig)) {
          sig = sig.replace(/^\s*/, '');
        }
      }
    }

    this.cantParse = false;
    if (!isZeroLevel) {
      code = code.replace(/\n([:\*#]+)/g, (s, m1) => {
        makeAllIntoColons = true;
        // **** → ::::, if the message contains a list or internal indentations.
        return '\n' + indentationCharacters.replace(/\*/g, ':') + m1;
      });
      if (makeAllIntoColons && indentationCharacters) {
        code = code.replace(/\n(?![:\#\x03])/g, (s, m1) => {
          let newIndentationCharacters = indentationCharacters.replace(/\*/g, ':');
          if (newIndentationCharacters === '#') {
            this.cantParse = true;
          }
          return '\n' + newIndentationCharacters + ' ';
        });
      }
      code = code.replace(/\n\n(?![:\*#])/g, '{{pb}}');
    }

    let tagRegExp = new RegExp('(?:<\\/\\w+ ?>|<' + cd.env.PNIE_PATTERN + ')$', 'i');
    code = code
      .replace(/^(.*[^\n])\n(?![\n:\*# \x03])(?=(.*))/gm, (s, m1, m2) => {
        return m1 +
          (!/^[:\*# ]/.test(m1) &&
              !/(?:\x02|\x04|<\w+(?: [\w ]+?=[^<>]+?| ?\/?)>|<\/\w+ ?>)$/.test(m1) &&
              !tagRegExp.test(m2) ?
            '<br>' :
            ''
          ) +
          (!isZeroLevel ? '' : '\n');
      })
      .replace(/\s*~{3,}$/, '');

    // Add ping template
    if (this.pingCheckbox && this.pingCheckbox.isSelected()) {
      code = '{{re|' + this.targetMsg.author + (code ? '' : '|p=.') + '}} ' + code;
    }

    // Add heading
    if (this.headingInput) {
      let level = this.mode === 'addSubsection' ?
        this.target.level + 1 :
        this.target.inCode.headingLevel;
      let equalSigns = '='.repeat(level);

      if (this.mode === 'edit' &&
        this.targetMsg.isOpeningSection &&
        /^\n/.test(this.targetMsg.inCode.code)
      ) {
        // To have pretty diffs.
        code = '\n' + code;
      }
      code = equalSigns + ' ' + this.headingInput.getValue().trim() + ' ' + equalSigns + '\n' + code;
    }

    // Add signature
    if (this.mode !== 'edit') {
      code += (code && !/\s$/.test(code) ? ' ' : '') + cd.settings.mySig;
    } else {
      code += sig;
    }

    // Add closer template
    if (this.#couldBeCloserClosing && this.headingInput.getValue().trim() === 'Итог' && !hasCloserTemplate) {
      code += '\n' + cd.settings.closerTemplate;
    }

    // Process small font wrappers
    if (this.smallCheckbox) {
      if (this.mode !== 'edit' || !this.targetMsg.inCode.inSmallTag) {
        if (this.smallCheckbox.isSelected()) {
          if (!/^[:\*#]/m.test(code)) {
            code = '{{block-small|1=' + code + '}}';
          } else {
            code = '<small>' + code + '</small>';  // Graceful degradation
          }
        }
      } else {
        if (this.smallCheckbox.isSelected()) {
          if (!/^[:\*#]/m.test(code)) {
            code = '{{block-small|1=' + code + '}}';
          } else {
            code = '<small>' + code + '</small>';  // Graceful degradation
          }
        } else {
          code = code.replace(/\}\}|<\/small>$/, '');
        }
      }
    }

    if (this.mode !== 'edit') {
      code += '\n';
    }

    // Add indentation characters
    if (action === 'submit') {
      if (this.mode === 'reply' || this.mode === 'replyInSection') {
        code = indentationCharacters + (indentationCharacters && !/^[:\*#]/.test(code) ? ' ' : '') + code;
      }
      if (this.mode === 'addSubsection') {
        code += '\n';
      }
    }

    let unhide = (s, num) => {
      return hidden[num - 1];
    }
    while (code.match(/(?:\x01|\x03)\d+(?:\x02|\x04)/)) {
      code = code.replace(/(?:\x01|\x03)(\d+)(?:\x02|\x04)/g, unhide);
    }

    // Remove unnecessary <br>'s
    code = code
      .replace(new RegExp('(<' + cd.env.PNIE_PATTERN + '(?: [\w ]+?=[^<>]+?| ?\/?)>)<br>', 'gi'), '$1')
      .replace(new RegExp('(<' + '\/' + cd.env.PNIE_PATTERN + ' ?>)<br>', 'gi'), '$1')
      .replace(/<br>(\s*\{\{[кК]онец цитаты[^}]*\}\})/g, '$1');

    return code;
  }

  prepareNewPageCode(pageCode, timestamp) {
    pageCode += '\n';

    let targetInCode = this.target.locateInCode(pageCode, timestamp);
    if (!targetInCode) {
      throw new cd.env.Exception(this.target instanceof Msg ? cd.strings.couldntLocateMsgInCode :
        cd.strings.couldntLocateSectionInCode);
    }

    let currentIndex;
    if (this.mode === 'reply') {
      currentIndex = targetInCode.endPos;
      let succeedingText = pageCode.slice(currentIndex);

      let properPlaceRegExp = new RegExp(
        '^([^]*?(?:' + mw.RegExp.escape(this.target.inCode.sig) +
        '|\\b\\d?\\d:\\d\\d, \\d\\d? [а-я]+ \\d\\d\\d\\d \\(UTC\\).*' + ')\\n)\\n*' +
        (targetInCode.indentationCharacters.length > 0 ?
          '[:\\*#]{0,' + targetInCode.indentationCharacters.length + '}' :
          ''
        ) +
        '(?![:\\*#\\n])'
      );
      let properPlaceMatches = properPlaceRegExp.exec(succeedingText);
      if (!properPlaceMatches) {
        throw new cd.env.Exception('Не удалось найти место в коде для вставки сообщения.');
      }

      // If the message is to be put after a message with different indent characters, use these.
      let textBeforeInsertion = properPlaceMatches[1];
      let changedIndentationCharactersMatches = textBeforeInsertion.match(/\n([:\*#]{2,}).*\n$/);
      let changedIndentationCharacters = changedIndentationCharactersMatches &&
        changedIndentationCharactersMatches[1];
      if (changedIndentationCharacters) {
        if (changedIndentationCharacters.length > targetInCode.indentationCharacters.length) {
          targetInCode.replyIndentationCharacters = changedIndentationCharacters
            .slice(0, targetInCode.indentationCharacters.length + 1)
            .replace(/:$/, '*');
        } else {
          targetInCode.indentationCharacters = changedIndentationCharacters
            .slice(0, targetInCode.indentationCharacters.length)
            .replace(/:$/, '*');
        }
      }

      let textBeforeInsertionForTest = textBeforeInsertion.replace(/<!--[^]*?-->/g, '');
      if (/\n(=+).*?\1[ \t]*\n/.test(textBeforeInsertionForTest)) {
        throw new cd.env.Exception('Не удалось найти место в коде для вставки сообщения (неожиданный заголовок).');
      }
      currentIndex += textBeforeInsertion.length;
    }

    if (this.mode === 'replyInSection' &&
      // So far we use this workaround to make sure "#" is not a part of a numbered list
      // in the target message (in contrast to messages organized in a numbered list).
      this.$element.parent()[0].tagName === 'OL'
    ) {
      let lastMsgIndentationFirstCharacterMatches = targetInCode.subdivisionCode.match(/\n#.*\n+$/);
      if (lastMsgIndentationFirstCharacterMatches) {
        this.target.inCode.lastMsgIndentationFirstCharacter = '#';
      }
    }

    let msgCode;
    let isDelete = this.deleteCheckbox && this.deleteCheckbox.isSelected();
    if (!isDelete) {
      msgCode = this.msgTextToCode('submit');
    }

    if (this.cantParse) {
      throw new cd.env.Exception('Невозможно корректно сформировать сообщение, не исказив разметку нумерованного списка. Уберите списки из сообщения.');
    }

    let newPageCode;
    if (this.mode === 'reply') {
      newPageCode = pageCode.slice(0, currentIndex) + msgCode + pageCode.slice(currentIndex);
    } else if (this.mode === 'edit') {
      let startPos;
      let endPos = targetInCode.endPos + targetInCode.sig.length + 1;
      if (!isDelete) {
        startPos = targetInCode.headingStartPos === undefined ?
          targetInCode.startPos :
          targetInCode.headingStartPos;
        newPageCode = pageCode.slice(0, startPos) + msgCode + pageCode.slice(targetInCode.endPos +
          targetInCode.sig.length
        );
      } else {
        if (targetInCode.headingStartPos === undefined) {
          let succeedingText = pageCode.slice(targetInCode.endPos);

          let repliesRegExp = new RegExp(
            '^.+\\n+[:\\*#]{' + (targetInCode.indentationCharacters.length + 1) + ',}'
          );
          let repliesMatches = repliesRegExp.exec(succeedingText);

          if (repliesMatches) {
            throw new cd.env.Exception('Нельзя удалить сообщение, так как на него уже есть ответы.');
          } else {
            startPos = targetInCode.lineStartPos;
          }
        } else {
          let sectionInCode = this.target.section.locateInCode(pageCode, timestamp);
          let sectionCode = sectionInCode && sectionInCode.code;

          if (!sectionCode) {
            throw new cd.env.Exception('Не удалось удалить тему: не получилось определить местоположение раздела в коде.');
          }

          let tempSectionCode = sectionCode;
          for (let msgCount = 0; msgCount < 2; msgCount++) {
            let [firstMsgMatch, firstMsgInitialPos] = cd.env.findFirstMsg(tempSectionCode);
            if (!firstMsgMatch) break;
            tempSectionCode = tempSectionCode.slice(firstMsgInitialPos + firstMsgMatch[0].length);
          }
          if (msgCount > 1) {
            throw new cd.env.Exception('Нельзя удалить тему, так как в ней уже есть ответы.');
          } else {
            startPos = targetInCode.headingStartPos;
            if (pageCode[endPos] === '\n') {
              endPos++;
            }
          }
        }

        newPageCode = pageCode.slice(0, startPos) + pageCode.slice(endPos);
      }
    } else if (this.mode === 'addSubsection') {
      newPageCode = pageCode.slice(0, targetInCode.endPos).replace(/([^\n])\n$/, '$1\n\n') + msgCode +
        pageCode.slice(targetInCode.endPos);
    } else if (this.mode === 'replyInSection') {
      if (!targetInCode.subdivisionEndPos) {
        throw new cd.env.Exception('Не удалось найти место в коде для вставки сообщения.');
      }
      newPageCode = pageCode.slice(0, targetInCode.subdivisionEndPos) + msgCode +
        pageCode.slice(targetInCode.subdivisionEndPos);
    }

    return newPageCode;
  }

  async preview(callback) {
    this.$infoArea.cdEmpty(this.getTargetMsg(true));
    this.setPending(true);

    let msgCode = this.msgTextToCode('preview');

    try {
      let data = await new mw.Api().post({
        action: 'parse',
        text: msgCode,
        title: cd.env.CURRENT_PAGE,
        summary: cd.env.formSummary(this.summaryInput.getValue().trim()),
        prop: 'text',
        pst: '',
        disablelimitreport: '',
        formatversion: 2,
      });

      let error = data.error;
      if (error) {
        let text = error.code + ': ' + error.info;
        this.abort('Не удалось предпросмотреть сообщение. ' + text, data);
        return;
      }

      let html = data &&
        data.parse &&
        data.parse.text;

      if (html) {
        let msg = this.getTargetMsg(true, true);
        if (msg) {
          msg.prepareUnderlayersInViewport(true);
        }

        this.$previewArea
          .html(html)
          .cdAddCloseButton('предпросмотр', this.getTargetMsg(true));

        let $parsedsummary = data.parse.parsedsummary && cd.env.toJquerySpan(data.parse.parsedsummary);
        if ($parsedsummary.length) {
          $parsedsummary.find('a').attr('tabindex', '-1');
          this.$element.find('.cd-summaryPreview').html(
            'Предпросмотр описания изменения: <span class="comment">' + $parsedsummary.html() +
              '</span>'
          );
        }
        if (msg) {
          msg.updateUnderlayersInViewport(true);
        }
      }
      if (!this.$previewArea.cdIsInViewport()) {
        this.$previewArea.cdScrollTo('top');
      }
      this.setPending(false);
    } catch (e) {
      this.abort('Не удалось предпросмотреть сообщение.', e);
    }

    if (callback) {
      callback();
    }
  }

  async viewChanges() {
    this.$infoArea.cdEmpty(this.getTargetMsg(true));
    this.setPending(true);

    try {
      let result = await cd.env.loadPageCode(cd.env.CURRENT_PAGE);
      let newPageCode;
      try {
        newPageCode = this.prepareNewPageCode(result.code, result.queryTimestamp);
      } catch (e) {
        if (e instanceof cd.env.Exception) {
          this.abort(e.message);
        } else {
          this.abort(
            'Произошла ошибка JavaScript. Подробности см. в консоли JavaScript (F12 → Консоль).',
            e.stack || e.message,
          );
        }
        return;
      }

      mw.loader.load('mediawiki.diff.styles');

      try {
        let data = await new mw.Api().post({
          action: 'query',
          rvdifftotext: newPageCode,
          titles: cd.env.CURRENT_PAGE,
          prop: 'revisions',
          formatversion: 2,
        });
        let error = data.error;
        if (error) {
          let text = error.code + ': ' + error.info;
          this.abort('Не удалось загрузить изменения. ' + text, data);
          return;
        }

        let html = data &&
          data.query &&
          data.query.pages &&
          data.query.pages[0] &&
          data.query.pages[0].revisions &&
          data.query.pages[0].revisions[0] &&
          data.query.pages[0].revisions[0].diff &&
          data.query.pages[0].revisions[0].diff.body;

        if (html) {
          html = '<table class="diff">' +
            '<col class="diff-marker"><col class="diff-content">' +
            '<col class="diff-marker"><col class="diff-content">' +
            html +
            '</table>';

          this.$previewArea
            .cdHtml(html, this.getTargetMsg(true))
            .cdAddCloseButton('просмотр изменений', this.getTargetMsg(true));
        } else {
          this.$previewArea.empty();
          if (html !== undefined) {
            this.showInfo('Изменений нет.');
          }
        }
        if (!this.$previewArea.cdIsInViewport()) {
          this.$previewArea.cdScrollTo('top');
        }
        this.setPending(false);
      } catch (e) {
        this.abort('Не удалось загрузить изменения.', e);
      }
    } catch (e) {
      let [errorType, data] = e;
      cd.env.genericErrorHandler.call(this, {
        errorType,
        data,
        message: 'Не удалось получить код страницы',
      });
    }
  }

  reloadPageAfterSubmit(anchor) {
    this.destroy({ leaveInfo: true });

    cd.env.reloadPage(anchor).fail((e) => {
      let [errorType, data] = e;
      if (cd.settings.showLoadingOverlay !== false) {
        cd.env.removeLoadingOverlay();
      }

      cd.env.genericErrorHandler.call(this, {
        errorType,
        data,
        retryFunc: () => {
          this.reloadPageAfterSubmit(anchor);
        },
        message: 'Не удалось обновить страницу',
      });
    });
  }

  async submit() {
    let isDelete = false;
    if (this.headingInput &&
      this.headingInput.getValue() === '' &&
      !confirm('Вы не ввели ' + this.headingInputPurpose.toLowerCase() + '. Всё равно отправить форму?')
    ) {
      this.headingInput.focus();
      return;
    }
    if (!this.textarea.getValue().trim() &&
      !/^Википедия:Заявки на статус /.test(cd.env.CURRENT_PAGE) &&
      !confirm('Вы действительно хотите отправить пустое сообщение?')
    ) {
      this.textarea.focus();
      return;
    }
    if (this.deleteCheckbox &&
      this.deleteCheckbox.isSelected()
    ) {
      if (!confirm('Вы действительно хотите удалить сообщение?')) return;
      isDelete = true;
    }

    this.$infoArea.cdEmpty(this.getTargetMsg(true));
    this.setPending(true, true);

    try {
      let result = await cd.env.loadPageCode(cd.env.CURRENT_PAGE);
      let newPageCode;
      try {
        newPageCode = this.prepareNewPageCode(result.code, result.queryTimestamp);
      } catch (e) {
        if (e instanceof cd.env.Exception) {
          this.abort(e.message);
        } else {
          this.abort(
            'Произошла ошибка JavaScript. Подробности см. в консоли JavaScript (F12 → Консоль).',
            e.stack || e.message,
          );
        }
        return;
      }

      try {
        let data = await new mw.Api().postWithToken('csrf', {
          action: 'edit',
          title: cd.env.CURRENT_PAGE,
          summary: cd.env.formSummary(this.summaryInput.getValue().trim()),
          text: newPageCode,
          basetimestamp: new Date(result.timestamp).toISOString(),
          starttimestamp: new Date(result.queryTimestamp).toISOString(),
          minor: this.minorCheckbox && this.minorCheckbox.isSelected(),
          watchlist: this.watchCheckbox.isSelected() ? 'watch' : 'unwatch',
          formatversion: 2,
        });
        // error can't be here?
        let error = data.error;
        if (error) {
          let text = error.code + ': ' + error.info;
          this.abort(text);
          return;
        }

        let verb = 'отправлено';
        if (this.mode === 'edit') {
          if (!isDelete) {
            verb = 'сохранено';
          } else {
            verb = 'удалено';
          }
        }
        this.showInfo('Сообщение успешно ' + verb);
        this.setPending(false, true);

        let anchor;
        if (this.mode !== 'edit') {
          let now = new Date();
          anchor = cd.env.generateMsgAnchor(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            now.getUTCHours(),
            now.getUTCMinutes(),
            cd.env.CURRENT_USER
          );
        } else {
          anchor = this.target.anchor;
        }

        cd.msgForms[cd.msgForms.indexOf(this)].submitted = true;
        if (cd.getLastActiveAlteredMsgForm()) {
          this.preview(() => {
            let $info = cd.env.toJquerySpan('Сообщение было отправлено, но на странице также имеются другие открытые формы. Отправьте их для перезагрузки страницы или <a href="javascript:">перезагрузите страницу</a> всё равно.');
            $info.find('a').click(() => {
              this.reloadPageAfterSubmit(anchor);
            });
            this.showInfo($info);
            this.destroy({ leaveInfo: true, leavePreview: true });
          });
        } else {
          this.reloadPageAfterSubmit(anchor);
        }
      } catch (e) {
        [jqXHR, textStatus, errorThrown] = e;
        // Something strange about the parameters, they are volatile.
        let error = textStatus && textStatus.error;
        if (error) {
          let text;
          if (error.code === 'editconflict') {
            text = 'Конфликт редактирования. Пробуем ещё раз…';
            this.submit();
          } else {
            text = 'Ответ сервера не распознан. Не удалось отредактировать страницу.';
          }
          this.abort(text);
          return;
        }

        this.abort(
          'Не получен ответ сервера. Возможно, не удалось отредактировать страницу.',
          [jqXHR, textStatus, errorThrown],
        );
      }
    } catch (e) {
      [errorType, data] = e;
      cd.env.genericErrorHandler.call(this, {
        errorType,
        data,
        message: 'Не удалось получить код страницы',
      });
    }
  }

  cancel(options = {}) {
    let leaveInfo = options.leaveInfo;

    if (!leaveInfo) {
      this.$infoArea.empty();
    }
    this.$previewArea.empty();

    if (this.mode !== 'edit') {
      this.$element[cd.settings.slideEffects ? 'cdSlideUp' : 'cdFadeOut']('fast', () => {
        this.$element.addClass('cd-msgForm-hidden');
        if (this.mode === 'replyInSection') {
          this.target.$replyButtonContainer.show();
        }
      }, this.getTargetMsg(true));
    } else {
      this.$element.cdFadeOut('fast', () => {
        this.$element.addClass('cd-msgForm-hidden');
        this.target.$elements.show();
        if (!this.target.isOpeningSection) {
          if (!this.target.$elements.cdIsInViewport()) {
            this.target.$elements.cdScrollTo('top');
          }
        } else {
          this.target.section.$heading.show();
          if (!this.target.section.$heading.cdIsInViewport()) {
            this.target.section.$heading.cdScrollTo('top');
          }
        }
        this.target.configureUnderlayer();
      }, this.getTargetMsg(true));
    }

    if (this.mode === 'reply') {
      let $elements;
      if (!this.target.isOpeningSection) {
        $elements = this.target.$elements;
      } else {
        $elements = this.target.section.$heading;
      }
      if (!$elements.cdIsInViewport()) {
        $elements.cdScrollTo('top');
      }
    } else if (this.mode === 'replyInSection' || this.mode === 'addSubsection') {
      let $lastVisible;
      if (this.mode === 'replyInSection') {
        let $prev = this.target.$replyButtonContainer.prev();
        if ($prev.length) {
          $lastVisible = $prev;
        } else {
          $lastVisible = this.target.$replyButtonContainer.parent().prev();
        }
      } else if (this.mode === 'addSubsection') {
        $lastVisible = this.target.$elements.filter(':visible').last();
      }

      if (!$lastVisible.cdIsInViewport(true)) {
        $lastVisible.cdScrollTo('bottom');
      }
    }
  }

  destroy(options = {}) {
    let { leaveInfo, leavePreview } = options;

    this.$wrapper
      .children(
        (leaveInfo ? ':not(.cd-infoArea)' : '') +
        (leavePreview ? ':not(.cd-previewArea)' : '')
      )
      .remove();
    if ((!leaveInfo && !leavePreview) ||
      (!leavePreview && this.$wrapper.children('.cd-infoArea:empty').length)
    ) {
      this.$element.remove();
    }
    cd.msgForms.splice(cd.msgForms.indexOf(this), 1);
    delete this.target[this::modeToProperty(this.mode) + 'Form'];
  }

  isActive() {
    return !this.submitted && !this.$element.hasClass('cd-msgForm-hidden');
  }

  isActiveAndAltered() {
    return this.isActive() &&
      (this.originalText !== this.textarea.getValue() ||
        this.defaultSummary !== this.summaryInput.getValue() ||
        (this.headingInput && this.originalHeadingText !== this.headingInput.getValue())
      );
  }
}

function modeToProperty(mode) {
  let property;
  if (mode === 'replyInSection') {
    property = 'addReply';
  } else {
    property = mode;
  }
  return property;
}
