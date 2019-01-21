import Msg from './Msg';
import Section from './Section';

export default class MsgForm {
  #couldBeCloserClosing;
  #standardButtonsTotalWidth;
  #standardSubmitButtonLabel;
  #shortSubmitButtonLabel;

  constructor(mode, target, $addSectionLink) {
    this.mode = mode;
    this.target = target;

    if (this.mode === 'addSection' && !$addSectionLink) return;

    cd.msgForms.push(this);

    let sectionHeading;
    if (this.target instanceof Msg) {
      sectionHeading = this.target.section && this.target.section.heading;
    } else if (this.target instanceof Section) {
      sectionHeading = this.target.heading;
    }

    let tag;
    let addOlClass;
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
    } else if (this.mode === 'addSection' || this.mode === 'addSubsection') {
      tag = 'div';
    } else {
      const $lastTagOfTarget = this.target.$elements.cdRemoveNonTagNodes().last();
      const lastTagOfTargetName = $lastTagOfTarget.prop('tagName');
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
    if (this.targetMsg &&
      !this.targetMsg.author &&
      (this.mode === 'reply' ||
        this.mode === 'edit' )
    ) {
      return;
    }

    if (this.target instanceof Section) {
      this.targetSection = this.target;
    } else if (this.target instanceof Msg) {
      this.targetSection = this.target.section;
    }

    this.summaryAltered = false;
    const defaultSummaryComponents = {
      section: sectionHeading ? `/* ${sectionHeading} */ ` : '',
    };

    const formUserName = (msg, genitive) => {
      let to;
      if (msg.authorGender === undefined) {
        to = !genitive ? 'участнику' : 'участника';
        if (msg.isAuthorRegistered) {
          // Idea to avoid making requests every time: store most active users' genders
          // in a variable. Make a SQL query to retrieve them from time to time: see
          // https://quarry.wmflabs.org/query/24299.
          new mw.Api().get({
            action: 'query',
            list: 'users',
            ususers: msg.author,
            usprop: 'gender',
            formatversion: 2,
          })
            .done((data) => {
              const gender = data &&
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

    const generateDefaultSummaryDescription = () => {
      if (this.mode === 'edit' && this.target.isOpeningSection) {
        defaultSummaryComponents.section = `/* ${this.headingInput.getValue()} */ `;
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
      } else if (this.mode === 'addSection') {
        const uri = new mw.Uri($addSectionLink.attr('href'));
        const summary = uri.query.summary;
        const newTopicSummary = summary && summary.replace(/^.+?\*\/ */, '');
        defaultSummaryComponents.description = newTopicSummary || 'новая тема';
      } else if (this.mode === 'addSubsection') {
        defaultSummaryComponents.description = 'новый подраздел';
      }
    };

    const updateDefaultSummary = (generateDescription) => {
      if (this.summaryAltered) return;

      if (generateDescription) {
        generateDefaultSummaryDescription();
      }

      this.defaultSummary = defaultSummaryComponents.section + defaultSummaryComponents.description;

      let newSummary = this.defaultSummary;
      if ((this.mode === 'reply' || this.mode === 'replyInSection')) {
        const summaryFullMsgText = this.textarea.getValue().trim().replace(/\s+/g, ' ');

        if (summaryFullMsgText &&
          summaryFullMsgText.length <= cd.env.SUMMARY_FULL_MSG_TEXT_LENGTH_LIMIT
        ) {
          const projectedSummary = this.defaultSummary + ': ' + summaryFullMsgText + ' (-)';

          if (projectedSummary.length <= cd.env.ACTUAL_SUMMARY_LENGTH_LIMIT) {
            newSummary = projectedSummary;
          }
        }
      } else if (this.mode === 'addSection') {
        const summaryHeadingText = this.headingInput.getValue().trim();

        if (summaryHeadingText) {
          const projectedSummary = (`/* ${summaryHeadingText} */ ${this.defaultSummary}`);
          if (projectedSummary.length <= cd.env.ACTUAL_SUMMARY_LENGTH_LIMIT) {
            newSummary = projectedSummary;
          }
        }
      } else if (this.mode === 'addSubsection') {
        const summaryHeadingText = this.headingInput.getValue().trim();

        if (summaryHeadingText) {
          const projectedSummary = (`${this.defaultSummary}: /* ${summaryHeadingText} */`)
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

    this.id = cd.env.msgFormsCounter++;

    if (this.mode === 'addSection' ||
      this.mode === 'addSubsection' ||
      (this.mode === 'edit' &&
        this.target.isOpeningSection
      )
    ) {
      if (this.mode === 'addSubsection' || (this.target && this.target.section.level > 2)) {
        this.headingInputPurpose = 'Название подраздела';
      } else {
        this.headingInputPurpose = 'Название темы';
      }

      this.headingInput = new OO.ui.TextInputWidget({
        placeholder: this.headingInputPurpose,
        classes: ['cd-headingInput'],
        tabIndex: String(this.id) + '11',
      });
      this.headingInput.$element.appendTo(this.$form);
      this.headingInput.on('change', (headingInputText) => {
        updateDefaultSummary(this.mode === 'edit');

        if (headingInputText.includes('{{')) {
          this.showWarning(
            'Не используйте шаблоны в заголовках — это ломает ссылки на разделы.',
            'dontUseTemplatesInHeadings'
          );
        } else {
          this.hideWarning('dontUseTemplatesInHeadings');
        }
      });
    }

    // Array elements: text pattern, reaction, icon, class, additional condition.
    const textReactions = [
      {
        pattern: /~~\~/,
        // Minifier eats "~~\~~" and "'~~' + '~~'"!
        message: 'Вводить <kbd>~~'.concat('~~</kbd> не нужно — подпись подставится автоматически.'),
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

    let rowNumber = this.mode === 'addSection' ? 8 : 5;
    if ($.client.profile().name === 'firefox') {
      rowNumber--;
    }
    this.textarea = new OO.ui.MultilineTextInputWidget({
      value: '',
      autosize: true,
      rows: rowNumber,
      maxRows: 30,
      classes: ['cd-textarea'],
      tabIndex: String(this.id) + '12',
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
      tabIndex: String(this.id) + '13',
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
        tabIndex: String(this.id) + '20',
      });
      this.minorCheckboxField = new OO.ui.FieldLayout(this.minorCheckbox, {
        label: 'Малое изменение',
        align: 'inline',
      });
    }

    this.watchCheckbox = new OO.ui.CheckboxInputWidget({
      value: 'watch',
      selected: !!mw.user.options.get('watchdefault') || !!$('#ca-unwatch').length,
      tabIndex: String(this.id) + '21',
    });
    this.watchCheckboxField = new OO.ui.FieldLayout(this.watchCheckbox, {
      label: 'В список наблюдения',
      align: 'inline',
    });

    const watchTopicCheckboxLabel = this.targetSection && this.targetSection.level <= 2 ||
        this.mode === 'addSection' ?
      'Следить за темой' :
      'Следить за подразделом';

    this.watchTopicCheckbox = new OO.ui.CheckboxInputWidget({
      value: 'watchTopic',
      selected: this.mode !== 'edit' || this.targetMsg.section.isWatched,
      tabIndex: String(this.id) + '22',
    });
    this.watchTopicCheckboxField = new OO.ui.FieldLayout(this.watchTopicCheckbox, {
      label: watchTopicCheckboxLabel,
      align: 'inline',
    });

    if (this.mode !== 'edit' && this.targetMsg) {
      this.pingCheckbox = new OO.ui.CheckboxInputWidget({
        value: 'ping',
        tabIndex: String(this.id) + '23',
      });
      this.pingCheckboxField = new OO.ui.FieldLayout(this.pingCheckbox, {
        align: 'inline',
      });
    }

    const updatePingCheckbox = () => {
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

    if (this.mode !== 'addSection' &&
      this.mode !== 'addSubsection' &&
      !(this.mode === 'edit' && this.target.isOpeningSection)
    ) {
      this.smallCheckbox = new OO.ui.CheckboxInputWidget({
        value: 'small',
        tabIndex: String(this.id) + '24',
      });

      this.smallCheckboxField = new OO.ui.FieldLayout(this.smallCheckbox, {
        label: 'Мелким шрифтом',
        align: 'inline',
        tabIndex: String(this.id) + '25',
      });
    }

    if (this.mode === 'replyInSection') {
      this.noIndentationCheckbox = new OO.ui.CheckboxInputWidget({
        value: 'noIndentation',
        tabIndex: String(this.id) + '26',
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
        const replies = [];
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
          tabIndex: String(this.id) + '27',
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
    if (this.watchTopicCheckboxField) {
      this.horizontalLayout.addItems([this.watchTopicCheckboxField]);
    }
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
    } else if (this.mode === 'addSection') {
      this.#standardSubmitButtonLabel = 'Добавить тему';
      this.#shortSubmitButtonLabel = 'Добавить';
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
      tabIndex: String(this.id) + '35',
    });

    this.previewButton = new OO.ui.ButtonWidget({
      label: 'Предпросмотреть',
      classes: ['cd-previewButton'],
      tabIndex: String(this.id) + '34',
    });
    this.previewButton.on('click', this.preview.bind(this));

    if (this.mode === 'edit' || cd.config.debug) {
      this.viewChangesButton = new OO.ui.ButtonWidget({
        label: 'Просмотреть изменения',
        classes: ['cd-viewChangesButton'],
      tabIndex: String(this.id) + '33',
      });
      this.viewChangesButton.on('click', this.viewChanges.bind(this));
    }

    this.settingsButton = new OO.ui.ButtonWidget({
      label: 'Настройки',
      framed: false,
      classes: ['cd-settingsButton'],
      tabIndex: String(this.id) + '30',
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
      tabIndex: String(this.id) + '31',
    });

    this.cancelButton = new OO.ui.ButtonWidget({
      label: 'Отменить',
      flags: 'destructive',
      framed: false,
      classes: ['cd-cancelButton'],
      tabIndex: String(this.id) + '32',
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
    } else if (this.mode === 'addSection') {
      this.newTopicOnTop = $addSectionLink.is('[href*="section=0"]');
      if (this.newTopicOnTop && cd.sections[0]) {
        this.$element.insertBefore(cd.sections[0].$heading);
      } else {
        this.$element.appendTo(cd.env.$content);
      }
    } else if (this.mode === 'addSubsection') {
      const headingLevelRegExp = new RegExp(
        `\\bcd-msgForm-addSubsection-[${this.target.level}-6]\\b`
      );
      let $last = this.target.$elements.last();
      let $nextToLast = $last.next();
      while ($nextToLast.hasClass('cd-replyButtonContainerContainer') ||
        $nextToLast.hasClass('cd-addSubsectionButtonContainer') ||
        ($nextToLast.hasClass('cd-msgForm') &&
            !$nextToLast.hasClass('cd-msgForm-addSubsection') &&
            !$nextToLast.hasClass('cd-msgForm-addSection')
          ) ||
        ($nextToLast[0] && $nextToLast[0].className.match(headingLevelRegExp))
      ) {
        $last = $nextToLast;
        $nextToLast = $last.next();
      }
      this.$element.insertAfter($last);
    }

    if (this.mode === 'addSection' || cd.settings.showToolbars) {
      const modules = ['ext.wikiEditor'];
      if (cd.env.IS_RUWIKI) {
        modules.push('ext.gadget.wikificator');
      }
      if (cd.env.IS_RUWIKI && mw.user.options.get('gadget-urldecoder')) {
        modules.push('ext.gadget.urldecoder');
      }
      mw.loader.using(modules).done(() => {
        this.textarea.$input.wikiEditor(
          'addModule',
          $.wikiEditor.modules.toolbar.config.getDefaultConfig()
        );

        this.$element.find('.group-insert').remove();

        if (cd.env.IS_RUWIKI) {
          this.textarea.$input.wikiEditor('addToToolbar', {
            'section': 'main',
            'groups': {
              'gadgets': {}
            },
          });
          const $groupGadgets = this.$element.find('.group-gadgets');
          const $groupFormat = this.$element.find('.group-format');
          if ($groupGadgets.length && $groupFormat.length) {
            $groupGadgets.insertBefore($groupFormat);
          }

          this.textarea.$input.wikiEditor('addToToolbar', {
            'section': 'main',
            'group': 'gadgets',
            'tools': {
              'wikificator': {
                label: 'Викификатор — автоматический обработчик текста',
                type: 'button',
                icon: '//upload.wikimedia.org/wikipedia/commons/0/06/Wikify-toolbutton.png',
                action: {
                  type: 'callback',
                  execute: () => {
                    Wikify(this.textarea.$input[0]);
                  },
                },
              },
            },
          });

          if (mw.user.options.get('gadget-urldecoder')) {
            this.textarea.$input.wikiEditor('addToToolbar', {
              'section': 'main',
              'group': 'gadgets',
              'tools': {
                'urlDecoder': {
                  label: 'Раскодировать URL перед курсором или все URL в выделенном тексте',
                  type: 'button',
                  icon: '//upload.wikimedia.org/wikipedia/commons/0/01/Link_go_remake.png',
                  action: {
                    type: 'callback',
                    execute: () => {
                      urlDecoderRun(this.textarea.$input[0]);
                    },
                  },
                },
              },
            });
          }
        }
      });

      const $insertButtons = $('<div>')
        .addClass('cd-insertButtons')
        .insertAfter(this.textarea.$element);

      const addInsertButton = (text, displayedText = text) => {
        $('<a>')
          .attr('href', 'javascript:')
          .text(displayedText.replace(/\+/, ''))
          .addClass('cd-insertButtons-item')
          .click((e) => {
            e.preventDefault();
            this.textarea.$input.textSelection(
              'encapsulateSelection',
              {
                pre: text.replace(/\+.+$/, ''),
                peri: '',
                post: displayedText.includes('+') ? text.replace(/^.+?\+/, '') : '',
              }
            );
          })
          .appendTo($insertButtons);
      };

      let insertButtons = cd.config.insertButtons;
      if ($.isArray(cd.settings.additionalInsertButtons)) {
        insertButtons = insertButtons.concat(cd.settings.additionalInsertButtons);
      }
      insertButtons.forEach((el) => {
        let text;
        let displayedText;
        if ($.isArray(el)) {
          text = el[0];
          displayedText = el[1];
        } else {
          text = el;
        }
        addInsertButton(text, displayedText);
      });
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

    // "focusin" is "focus" that bubbles, i.e. propagates up the node tree.
    this.$form.focusin(() => {
      cd.env.lastActiveMsgForm = this;
    });

    const retryLoad = () => {
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

      if (this.target) {
        // This is for test if the message exists.
        this.target.loadCode()
          .fail((e) => {
            let errorType;
            let data;
            if ($.isArray(e)) {
              [errorType, data] = e;
            } else {
              console.error(e);
            }
            cd.env.genericErrorHandler.call(this, {
              errorType,
              data,
              retryFunc: retryLoad,
              message: 'Не удалось загрузить сообщение',
            });
          });
      }
    } else if (mode === 'edit') {
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
          let errorType;
          let data;
          if ($.isArray(e)) {
            [errorType, data] = e;
          } else {
            console.error(e);
          }
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
    // By default, for sections, returns the first message in the section. If "last" parameter is
    // set to true, returns either the last message in the first section subdivision (i.e. the part
    // of the section up to the first heading) or the last message in the section, depending on
    // MsgForm.mode. It is useful for getting/updating underlayer positions before and after
    // animations.

    const target = this.target;
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
        for (let i = target.id + 1; i < cd.sections.length; i++) {
          const firstMsg = cd.sections[i].msgs[0];
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
      const $textWithIcon = cd.env.createTextWithIcon(html, icon)
        .addClass('cd-info')
        .addClass('cd-info-' + icon);
      if (class_) {
        $textWithIcon.addClass('cd-info-' + class_);
      }

      this.$infoArea.cdAppend($textWithIcon, this.getTargetMsg(true));
    }
  }

  hideInfo(class_) {
    const $info = this.$infoArea.children(`.cd-info-${class_}`);
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

      const cancelLink = new OO.ui.ButtonWidget({
        label: 'Отмена',
        framed: false,
      });
      cancelLink.on('click', () => {
        this.cancel();
      });

      const retryLink = new OO.ui.ButtonWidget({
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
    let indentationCharacters;
    let replyIndentationCharacters;
    // If this is a preview, there's no point to look into the code.
    if (action !== 'preview' && this.targetMsg) {
      indentationCharacters = this.targetMsg.inCode && this.targetMsg.inCode.indentationCharacters;
      replyIndentationCharacters = this.targetMsg.inCode &&
        this.targetMsg.inCode.replyIndentationCharacters;
    }
    if (!indentationCharacters) {
      indentationCharacters = '';
    }
    const isZeroLevel = this.mode === 'addSection' || this.mode === 'addSubsection' ||
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
      // Remove ending spaces from empty lines, only if they are not a part of a syntax creating
      // <pre>.
      .replace(/^ +[\s\uFEFF\xA0]+[^\s\uFEFF\xA0]/gm, (s) => {
        if (/ [^\s\uFEFF\xA0]$/.test(s)) {
          return s;
        } else {
          return s.replace(/^ +/gm, '');
        }
      });

    const hasCloserTemplate = (
      /\{\{(?:(?:subst|подст):)?ПИ2?\}\}|правах подводящего итоги/.test(code)
    );

    const hidden = [];
    let makeAllIntoColons = false;
    const hide = (re, isTable) => {
      code = code.replace(re, (s) => {
        if (isTable && !isZeroLevel) {
          makeAllIntoColons = true;
        }
        return (!isTable ? '\x01' : '\x03') + hidden.push(s) + (!isTable ? '\x02' : '\x04');
      });
    };
    const hideTags = function () {
      for (let i = 0; i < arguments.length; i++) {
        hide(
          new RegExp(`<${arguments[i]}( [^>]+)?>[\\s\\S]+?<\\/${arguments[i]}>`, 'gi')
        );
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

    // So that the signature doesn't turn out to be at the end of the last item of the list, if
    // the message contains one.
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
          const newIndentationCharacters = indentationCharacters.replace(/\*/g, ':');
          if (newIndentationCharacters === '#') {
            this.cantParse = true;
          }
          return '\n' + newIndentationCharacters + ' ';
        });
      }
      code = code.replace(/\n\n(?![:\*#])/g, '{{pb}}');
    }

    const tagRegExp = new RegExp(`(?:<\\/\\w+ ?>|<${cd.env.PNIE_PATTERN})$`, 'i');
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
      let level;
      if (this.mode === 'addSection') {
        level = 2;
      } else if (this.mode === 'addSubsection') {
        level = this.target.level + 1;
      } else {
        level = this.target.inCode.headingLevel;
      }
      const equalSigns = '='.repeat(level);

      if (this.mode === 'edit' &&
        this.targetMsg.isOpeningSection &&
        /^\n/.test(this.targetMsg.inCode.code)
      ) {
        // To have pretty diffs.
        code = '\n' + code;
      }
      code = `${equalSigns} ${this.headingInput.getValue().trim()} ${equalSigns}\n${code}`;
    }

    // Add signature
    if (this.mode !== 'edit') {
      code += (code && !/\s$/.test(code) ? ' ' : '') + cd.settings.mySig;
    } else {
      code += sig;
    }

    // Add closer template
    if (this.#couldBeCloserClosing &&
      this.headingInput.getValue().trim() === 'Итог' &&
      !hasCloserTemplate
    ) {
      code += '\n' + cd.settings.closerTemplate;
    }

    // Process small font wrappers
    if (this.smallCheckbox) {
      if (this.mode !== 'edit' || !this.targetMsg.inCode.inSmallTag) {
        if (this.smallCheckbox.isSelected()) {
          if (!/^[:\*#]/m.test(code)) {
            code = `{{block-small|1=${code}}}`;
          } else {
            code = `<small>${code}</small>`;  // Graceful degradation
          }
        }
      } else {
        if (this.smallCheckbox.isSelected()) {
          if (!/^[:\*#]/m.test(code)) {
            code = `{{block-small|1=${code}}}`;
          } else {
            code = `<small>${code}</small>`;  // Graceful degradation
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
        code = indentationCharacters + (indentationCharacters && !/^[:\*#]/.test(code) ? ' ' : '') +
          code;
      }
      if (this.mode === 'addSubsection') {
        code += '\n';
      }
      if (this.noIndentationCheckbox && this.noIndentationCheckbox.isSelected()) {
        code = '\n' + code;
      }
    }

    while (code.match(/(?:\x01|\x03)\d+(?:\x02|\x04)/)) {
      code = code.replace(/(?:\x01|\x03)(\d+)(?:\x02|\x04)/g, (s, num) => hidden[num - 1]);
    }

    // Remove unnecessary <br>'s
    code = code
      .replace(
        new RegExp(`(<${cd.env.PNIE_PATTERN}(?: [\w ]+?=[^<>]+?| ?\/?)>)<br>`, 'gi'),
        '$1'
      )
      .replace(new RegExp(`(<\/${cd.env.PNIE_PATTERN} ?>)<br>`, 'gi'), '$1')
      .replace(/<br>(\s*\{\{[кК]онец цитаты[^}]*\}\})/g, '$1');

    return code;
  }

  prepareNewPageCode(pageCode, timestamp) {
    pageCode += '\n';

    let targetInCode;
    if (this.mode !== 'addSection') {
      targetInCode = this.target.locateInCode(pageCode);
      if (!targetInCode) {
        throw new cd.env.Exception(this.target instanceof Msg ? cd.strings.couldntLocateMsgInCode :
          cd.strings.couldntLocateSectionInCode);
      }
    }

    let currentIndex;
    if (this.mode === 'reply') {
      currentIndex = targetInCode.endPos;
      const succeedingText = pageCode.slice(currentIndex);

      const properPlaceRegExp = new RegExp(
        '^([^]*?(?:' + mw.RegExp.escape(this.target.inCode.sig) +
        '|\\b\\d?\\d:\\d\\d, \\d\\d? [а-я]+ \\d\\d\\d\\d \\(UTC\\).*)\\n)\\n*' +
        (targetInCode.indentationCharacters.length > 0 ?
          `[:\\*#]{0,${targetInCode.indentationCharacters.length}}` :
          ''
        ) +
        '(?![:\\*#\\n])'
      );
      const properPlaceMatches = properPlaceRegExp.exec(succeedingText);
      if (!properPlaceMatches) {
        throw new cd.env.Exception('Не удалось найти место в коде для вставки сообщения.');
      }

      // If the message is to be put after a message with different indent characters, use these.
      const textBeforeInsertion = properPlaceMatches[1];
      const changedIndentationCharactersMatches = textBeforeInsertion.match(/\n([:\*#]{2,}).*\n$/);
      const changedIndentationCharacters = changedIndentationCharactersMatches &&
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

      const textBeforeInsertionForTest = textBeforeInsertion.replace(/<!--[^]*?-->/g, '');
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
      const lastMsgIndentationFirstCharacterMatches = (
        targetInCode.subdivisionCode.match(/\n#.*\n+$/)
      );
      if (lastMsgIndentationFirstCharacterMatches) {
        this.target.inCode.lastMsgIndentationFirstCharacter = '#';
      }
    }

    const isDelete = this.deleteCheckbox && this.deleteCheckbox.isSelected();
    let msgCode;
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
      if (!isDelete) {
        const startPos = targetInCode.headingStartPos === undefined ?
          targetInCode.startPos :
          targetInCode.headingStartPos;
        newPageCode = pageCode.slice(0, startPos) + msgCode +
          pageCode.slice(targetInCode.endPos + targetInCode.oldSig.length);
      } else {
        let startPos;
        let endPos = targetInCode.endPos + targetInCode.oldSig.length + 1;
        if (targetInCode.headingStartPos === undefined) {
          const succeedingText = pageCode.slice(targetInCode.endPos);

          const repliesRegExp = new RegExp(
            `^.+\\n+[:\\*#]{${targetInCode.indentationCharacters.length + 1},}`
          );
          const repliesMatches = repliesRegExp.exec(succeedingText);

          if (repliesMatches) {
            throw new cd.env.Exception('Нельзя удалить сообщение, так как на него уже есть ответы.');
          } else {
            startPos = targetInCode.lineStartPos;
          }
        } else {
          const sectionInCode = this.target.section.locateInCode(pageCode);
          const sectionCode = sectionInCode && sectionInCode.code;

          if (!sectionCode) {
            throw new cd.env.Exception('Не удалось удалить тему: не получилось определить местоположение раздела в коде.');
          }

          let tempSectionCode = sectionCode;
          for (let msgCount = 0; msgCount < 2; msgCount++) {
            const [firstMsgMatch, firstMsgInitialPos] = cd.env.findFirstMsg(tempSectionCode);
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
    } else if (this.mode === 'replyInSection') {
      if (!targetInCode.subdivisionEndPos) {
        throw new cd.env.Exception('Не удалось найти место в коде для вставки сообщения.');
      }
      newPageCode = pageCode.slice(0, targetInCode.subdivisionEndPos) + msgCode +
        pageCode.slice(targetInCode.subdivisionEndPos);
    } else if (this.mode === 'addSection') {
      if (this.newTopicOnTop) {
        const adjustedPageCode = pageCode.replace(
          /(<!--)([^]*?)(-->)/g,
          (s, m1, m2, m3) => m1 + ' '.repeat(m2.length) + m3
        );
        const firstSectionLocation = adjustedPageCode.search(/^(=+).*?\1/m);
        newPageCode = pageCode.slice(0, firstSectionLocation) + msgCode + '\n' +
          pageCode.slice(firstSectionLocation);
      } else {
        newPageCode = pageCode + '\n' + msgCode;
      }
    } else if (this.mode === 'addSubsection') {
      newPageCode = pageCode.slice(0, targetInCode.endPos).replace(/([^\n])\n$/, '$1\n\n') +
        msgCode + pageCode.slice(targetInCode.endPos);
    }

    return newPageCode;
  }

  async preview(callback) {
    this.$infoArea.cdEmpty(this.getTargetMsg(true));
    this.setPending(true);

    const msgCode = this.msgTextToCode('preview');

    try {
      const data = await new mw.Api().post({
        action: 'parse',
        text: msgCode,
        title: cd.env.CURRENT_PAGE,
        summary: cd.env.formSummary(this.summaryInput.getValue().trim()),
        prop: 'text',
        pst: '',
        disablelimitreport: '',
        formatversion: 2,
      });

      const error = data.error;
      if (error) {
        const text = error.code + ': ' + error.info;
        this.abort('Не удалось предпросмотреть сообщение. ' + text, data);
        return;
      }

      const html = data &&
        data.parse &&
        data.parse.text;

      if (html) {
        const msg = this.getTargetMsg(true, true);
        if (msg) {
          msg.prepareUnderlayersInViewport(true);
        }

        this.$previewArea
          .html(html)
          .cdAddCloseButton('предпросмотр', this.getTargetMsg(true));

        const $parsedsummary = data.parse.parsedsummary &&
          cd.env.toJquerySpan(data.parse.parsedsummary);
        if ($parsedsummary.length) {
          this.$element.find('.cd-summaryPreview').html(
            `Предпросмотр описания изменения: <span class="comment">${$parsedsummary.html()}</span>`
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
      const result = await cd.env.loadPageCode(cd.env.CURRENT_PAGE);
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
        const data = await new mw.Api().post({
          action: 'query',
          rvdifftotext: newPageCode,
          titles: cd.env.CURRENT_PAGE,
          prop: 'revisions',
          formatversion: 2,
        });
        const error = data.error;
        if (error) {
          const text = error.code + ': ' + error.info;
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
      let errorType;
      let data;
      if ($.isArray(e)) {
        [errorType, data] = e;
      } else {
        console.error(e);
      }
      cd.env.genericErrorHandler.call(this, {
        errorType,
        data,
        message: 'Не удалось получить код страницы',
      });
    }
  }

  reloadPageAfterSubmit(keepedData) {
    this.destroy({ leaveInfo: true });

    cd.env.reloadPage(keepedData).fail((e) => {
      let errorType;
      let data;
      if ($.isArray(e)) {
        [errorType, data] = e;
      } else {
        console.error(e);
      }
      if (cd.settings.showLoadingOverlay !== false) {
        cd.env.removeLoadingOverlay();
      }

      cd.env.genericErrorHandler.call(this, {
        errorType,
        data,
        retryFunc: () => {
          this.reloadPageAfterSubmit(keepedData);
        },
        message: 'Не удалось обновить страницу',
      });
    });
  }

  async submit() {
    let isDelete = false;
    if (this.headingInput &&
      this.headingInput.getValue() === '' &&
      !confirm(`Вы не ввели ${this.headingInputPurpose.toLowerCase()}. Всё равно отправить форму?`)
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
      const result = await cd.env.loadPageCode(cd.env.CURRENT_PAGE);
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

      let keepedData = {};
      let justWatchedTopic;
      let justUnwatchedTopic;
      if (this.watchTopicCheckbox.isSelected()) {
        const section = this.targetSection;
        if (section && !section.isWatched) {
          section.watch(true);
          justWatchedTopic = section.heading;
        }
        if (this.mode === 'addSection') {
          const heading = cd.env.cleanSectionHeading(this.headingInput.getValue().trim());
          cd.env.watchTopic(heading, true);
          justWatchedTopic = heading;
        }

      } else {
        const section = this.targetSection;
        if (section && section.isWatched) {
          section.unwatch(true);
          justUnwatchedTopic = section.heading;
        }
      }
      // That's a hack used when we pass in keepedData a name of a topic that was set to be
      // watched/unwatched via a checkbox in a form just sent. The server doesn't manage to update
      // the value so quickly, so it returns the old value, but we must display the new one.
      keepedData.justWatchedTopic = justWatchedTopic;
      keepedData.justUnwatchedTopic = justUnwatchedTopic;

      try {
        const data = await new mw.Api().postWithToken('csrf', {
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
        const error = data.error;
        if (error) {
          const text = error.code + ': ' + error.info;
          this.abort(text);
          return;
        }

        let message;
        if (this.mode === 'reply' || this.mode === 'replyInSection') {
          message = 'Сообщение успешно отправлено';
        } else if (this.mode === 'edit') {
          if (!isDelete) {
            message = 'Сообщение успешно сохранено';
          } else {
            message = 'Сообщение успешно удалено';
          }
        } else if (this.mode === 'addSection') {
          message = 'Тема успешно добавлена'
        } else if (this.mode === 'addSubsection') {
          message = 'Подраздел успешно добавлен'
        }
        this.showInfo(message);
        this.setPending(false, true);

        let anchor;
        if (this.mode !== 'edit') {
          const now = new Date();
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
        keepedData.anchor = anchor;

        cd.msgForms[cd.msgForms.indexOf(this)].submitted = true;
        if (cd.getLastActiveAlteredMsgForm()) {
          this.preview(() => {
            const $info = cd.env.toJquerySpan('Сообщение было отправлено, но на странице также имеются другие открытые формы. Отправьте их для перезагрузки страницы или <a href="javascript:">перезагрузите страницу</a> всё равно.');
            $info.find('a').click(() => {
              this.reloadPageAfterSubmit(keepedData);
            });
            this.showInfo($info);
            this.destroy({ leaveInfo: true, leavePreview: true });
          });
        } else {
          this.reloadPageAfterSubmit(keepedData);
        }
      } catch (e) {
        [jqXHR, textStatus, errorThrown] = e;
        // Something strange about the parameters, they are volatile.
        const error = textStatus && textStatus.error;
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
      let errorType;
      let data;
      if ($.isArray(e)) {
        [errorType, data] = e;
      } else {
        console.error(e);
      }
      cd.env.genericErrorHandler.call(this, {
        errorType,
        data,
        message: 'Не удалось получить код страницы',
      });
    }
  }

  cancel() {
    let confirmation = true;
    if (this.isAltered()) {
      confirmation = confirm('Вы действительно хотите закрыть форму? Внесённые изменения будет потеряны.');
    }
    if (!confirmation) {
      this.textarea.focus();
      return;
    }

    if (this.mode !== 'edit') {
      this.$element[cd.settings.slideEffects ? 'cdSlideUp' : 'cdFadeOut']('fast', () => {
        this.destroy();
        if (this.mode === 'replyInSection') {
          this.target.$replyButtonContainer.show();
        }
      }, this.getTargetMsg(true));
    } else {
      this.$element.cdFadeOut('fast', () => {
        this.destroy();
        this.target.$elements.show();
        this.target.isEdited = false;
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
        const $prev = this.target.$replyButtonContainer.prev();
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
    const { leaveInfo, leavePreview } = options;

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
    // Could be already deleted, since destroy can run twice.
    if (cd.msgForms.includes(this)) {
      cd.msgForms.splice(cd.msgForms.indexOf(this), 1);
    }
    if (this.target) {
      delete this.target[this::modeToProperty(this.mode) + 'Form'];
    }
    if (cd.lastActiveMsgForm === this) {
      cd.lastActiveMsgForm = null;
    }
    if (this.mode === 'addSection') {
      cd.env.addSectionForm = null;
    }
  }

  isActive() {
    return !this.submitted;
  }

  isAltered() {
    return (this.originalText !== this.textarea.getValue() ||
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
