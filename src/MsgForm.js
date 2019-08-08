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
        defaultSummaryComponents.section = (
          `/* ${cd.env.cleanSectionHeading(this.headingInput.getValue())} */ `
        );
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
              if (this.target.parent.isOpeningSection || this.target.parent.level === 0) {
                defaultSummaryComponents.description = 'редактирование ответа';
              } else {
                if (this.target.parent.author !== cd.env.CURRENT_USER) {
                  defaultSummaryComponents.description = 'редактирование ответа ' +
                    formUserName(this.target.parent);
                } else {
                  defaultSummaryComponents.description = 'редактирование дополнения';
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
        const summaryHeadingText = cd.env.cleanSectionHeading(this.headingInput.getValue());

        if (summaryHeadingText) {
          const projectedSummary = (`/* ${summaryHeadingText} */ ${this.defaultSummary}`);
          if (projectedSummary.length <= cd.env.ACTUAL_SUMMARY_LENGTH_LIMIT) {
            newSummary = projectedSummary;
          }
        }
      } else if (this.mode === 'addSubsection') {
        const summaryHeadingText = cd.env.cleanSectionHeading(this.headingInput.getValue());

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

    let rowNumber = 5;
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

    if (this.targetSection || this.mode === 'addSection') {
      const watchTopicCheckboxLabel = this.mode !== 'addSubsection' &&
          (this.targetSection && this.targetSection.level <= 2 ||
            this.mode === 'addSection'
          ) ?
        'Следить за темой' :
        'Следить за подразделом';

      this.watchTopicCheckbox = new OO.ui.CheckboxInputWidget({
        value: 'watchTopic',
        selected: (this.mode !== 'edit' &&
            cd.settings.watchTopicsOnReply
          ) || this.targetSection.isWatched,
        tabIndex: String(this.id) + '22',
      });
      this.watchTopicCheckboxField = new OO.ui.FieldLayout(this.watchTopicCheckbox, {
        label: watchTopicCheckboxLabel,
        align: 'inline',
      });
    }

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
      classes: ['cd-button', 'cd-settingsButton'],
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
      classes: ['cd-button'],
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
      classes: ['cd-button', 'cd-cancelButton'],
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

    if (cd.settings.showToolbars) {
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
          {"toolbar":{"main":{"type":"toolbar","groups":{"format":{"tools":{"bold":{"labelMsg":"wikieditor-toolbar-tool-bold","type":"button","oouiIcon":"bold","action":{"type":"encapsulate","options":{"pre":"'''","periMsg":"wikieditor-toolbar-tool-bold-example","post":"'''"}}},"italic":{"section":"main","group":"format","id":"italic","labelMsg":"wikieditor-toolbar-tool-italic","type":"button","oouiIcon":"italic","action":{"type":"encapsulate","options":{"pre":"''","periMsg":"wikieditor-toolbar-tool-italic-example","post":"''"}}}}},"insert":{"tools":{"signature":{"labelMsg":"wikieditor-toolbar-tool-signature","type":"button","oouiIcon":"signature","action":{"type":"encapsulate","options":{"pre":"--~~\~~"}}}}}}},"advanced":{"labelMsg":"wikieditor-toolbar-section-advanced","type":"toolbar","groups":{"heading":{"tools":{"heading":{"labelMsg":"wikieditor-toolbar-tool-heading","type":"select","list":{"heading-2":{"labelMsg":"wikieditor-toolbar-tool-heading-2","action":{"type":"encapsulate","options":{"pre":"== ","periMsg":"wikieditor-toolbar-tool-heading-example","post":" ==","regex":{},"regexReplace":"$1==$3==$4","ownline":true}}},"heading-3":{"labelMsg":"wikieditor-toolbar-tool-heading-3","action":{"type":"encapsulate","options":{"pre":"=== ","periMsg":"wikieditor-toolbar-tool-heading-example","post":" ===","regex":{},"regexReplace":"$1===$3===$4","ownline":true}}},"heading-4":{"labelMsg":"wikieditor-toolbar-tool-heading-4","action":{"type":"encapsulate","options":{"pre":"==== ","periMsg":"wikieditor-toolbar-tool-heading-example","post":" ====","regex":{},"regexReplace":"$1====$3====$4","ownline":true}}},"heading-5":{"labelMsg":"wikieditor-toolbar-tool-heading-5","action":{"type":"encapsulate","options":{"pre":"===== ","periMsg":"wikieditor-toolbar-tool-heading-example","post":" =====","regex":{},"regexReplace":"$1=====$3=====$4","ownline":true}}}}}}},"format":{"labelMsg":"wikieditor-toolbar-group-format","tools":{"ulist":{"labelMsg":"wikieditor-toolbar-tool-ulist","type":"button","oouiIcon":"listBullet","action":{"type":"encapsulate","options":{"pre":"* ","periMsg":"wikieditor-toolbar-tool-ulist-example","post":"","ownline":true,"splitlines":true}}},"olist":{"labelMsg":"wikieditor-toolbar-tool-olist","type":"button","oouiIcon":"listNumbered","action":{"type":"encapsulate","options":{"pre":"# ","periMsg":"wikieditor-toolbar-tool-olist-example","post":"","ownline":true,"splitlines":true}}},"nowiki":{"labelMsg":"wikieditor-toolbar-tool-nowiki","type":"button","oouiIcon":"noWikiText","action":{"type":"encapsulate","options":{"pre":"<nowiki>","periMsg":"wikieditor-toolbar-tool-nowiki-example","post":"</nowiki>"}}},"newline":{"labelMsg":"wikieditor-toolbar-tool-newline","type":"button","oouiIcon":"newline","action":{"type":"encapsulate","options":{"pre":"<br>\n"}}}}},"size":{"tools":{"big":{"labelMsg":"wikieditor-toolbar-tool-big","type":"button","oouiIcon":"bigger","action":{"type":"encapsulate","options":{"pre":"<big>","periMsg":"wikieditor-toolbar-tool-big-example","post":"</big>"}}},"small":{"labelMsg":"wikieditor-toolbar-tool-small","type":"button","oouiIcon":"smaller","action":{"type":"encapsulate","options":{"pre":"<small>","periMsg":"wikieditor-toolbar-tool-small-example","post":"</small>"}}},"superscript":{"labelMsg":"wikieditor-toolbar-tool-superscript","type":"button","oouiIcon":"superscript","action":{"type":"encapsulate","options":{"pre":"<sup>","periMsg":"wikieditor-toolbar-tool-superscript-example","post":"</sup>"}}},"subscript":{"labelMsg":"wikieditor-toolbar-tool-subscript","type":"button","oouiIcon":"subscript","action":{"type":"encapsulate","options":{"pre":"<sub>","periMsg":"wikieditor-toolbar-tool-subscript-example","post":"</sub>"}}}}},"insert":{"labelMsg":"wikieditor-toolbar-group-insert","tools":{"gallery":{"labelMsg":"wikieditor-toolbar-tool-gallery","type":"button","oouiIcon":"imageGallery","action":{"type":"encapsulate","options":{"pre":"<gallery>\n","periMsg":["wikieditor-toolbar-tool-gallery-example","Файл"],"post":"\n</gallery>","ownline":true}}},"redirect":{"labelMsg":"wikieditor-toolbar-tool-redirect","type":"button","oouiIcon":"articleRedirect","action":{"type":"encapsulate","options":{"pre":"#перенаправление [[","periMsg":"wikieditor-toolbar-tool-redirect-example","post":"]]","ownline":true}}}}}}},"characters":{"labelMsg":"wikieditor-toolbar-section-characters","type":"booklet","deferLoad":true,"pages":{"latin":{"labelMsg":"special-characters-group-latin","layout":"characters","characters":["Á","á","À","à","Â","â","Ä","ä","Ã","ã","Ǎ","ǎ","Ā","ā","Ă","ă","Ą","ą","Å","å","Ć","ć","Ĉ","ĉ","Ç","ç","Č","č","Ċ","ċ","Đ","đ","Ď","ď","É","é","È","è","Ê","ê","Ë","ë","Ě","ě","Ē","ē","Ĕ","ĕ","Ė","ė","Ę","ę","Ĝ","ĝ","Ģ","ģ","Ğ","ğ","Ġ","ġ","Ĥ","ĥ","Ħ","ħ","Í","í","Ì","ì","Î","î","Ï","ï","Ĩ","ĩ","Ǐ","ǐ","Ī","ī","Ĭ","ĭ","İ","ı","Į","į","Ĵ","ĵ","Ķ","ķ","Ĺ","ĺ","Ļ","ļ","Ľ","ľ","Ł","ł","Ń","ń","Ñ","ñ","Ņ","ņ","Ň","ň","Ó","ó","Ò","ò","Ô","ô","Ö","ö","Õ","õ","Ǒ","ǒ","Ō","ō","Ŏ","ŏ","Ǫ","ǫ","Ő","ő","Ŕ","ŕ","Ŗ","ŗ","Ř","ř","Ś","ś","Ŝ","ŝ","Ş","ş","Š","š","Ș","ș","Ț","ț","Ť","ť","Ú","ú","Ù","ù","Û","û","Ü","ü","Ũ","ũ","Ů","ů","Ǔ","ǔ","Ū","ū","ǖ","ǘ","ǚ","ǜ","Ŭ","ŭ","Ų","ų","Ű","ű","Ŵ","ŵ","Ý","ý","Ŷ","ŷ","Ÿ","ÿ","Ȳ","ȳ","Ź","ź","Ž","ž","Ż","ż","Æ","æ","Ǣ","ǣ","Ø","ø","Œ","œ","ß","Ð","ð","Þ","þ","Ə","ə"]},"latinextended":{"labelMsg":"special-characters-group-latinextended","layout":"characters","characters":["Ḁ","ḁ","ẚ","Ạ","ạ","Ả","ả","Ấ","ấ","Ầ","ầ","Ẩ","ẩ","Ẫ","ẫ","Ậ","ậ","Ắ","ắ","Ằ","ằ","Ẳ","ẳ","Ẵ","ẵ","Ặ","ặ","Ḃ","ḃ","Ḅ","ḅ","Ḇ","ḇ","Ḉ","ḉ","Ḋ","ḋ","Ḍ","ḍ","Ḏ","ḏ","Ḑ","ḑ","Ḓ","ḓ","Ḕ","ḕ","Ḗ","ḗ","Ḙ","ḙ","Ḛ","ḛ","Ḝ","ḝ","Ẹ","ẹ","Ẻ","ẻ","Ẽ","ẽ","Ế","ế","Ề","ề","Ể","ể","Ễ","ễ","Ệ","ệ","Ḟ","ḟ","Ḡ","ḡ","Ḣ","ḣ","Ḥ","ḥ","Ḧ","ḧ","Ḩ","ḩ","Ḫ","ḫ","ẖ","Ḭ","ḭ","Ḯ","ḯ","Ỉ","ỉ","Ị","ị","Ḱ","ḱ","Ḳ","ḳ","Ḵ","ḵ","ĸ","Ḷ","ḷ","Ḹ","ḹ","Ḻ","ḻ","Ḽ","ḽ","Ỻ","ỻ","Ḿ","ḿ","Ṁ","ṁ","Ṃ","ṃ","Ṅ","ṅ","Ṇ","ṇ","Ṉ","ṉ","Ṋ","ṋ","Ṍ","ṍ","Ṏ","ṏ","Ṑ","ṑ","Ṓ","ṓ","Ọ","ọ","Ỏ","ỏ","Ố","ố","Ồ","ồ","Ổ","ổ","Ỗ","ỗ","Ộ","ộ","Ớ","ớ","Ờ","ờ","Ở","ở","Ỡ","ỡ","Ợ","ợ","Ǿ","ǿ","Ơ","ơ","Ṕ","ṕ","Ṗ","ṗ","Ṙ","ṙ","Ṛ","ṛ","Ṝ","ṝ","Ṟ","ṟ","Ṡ","ṡ","ẛ","Ṣ","ṣ","Ṥ","ṥ","Ṧ","ṧ","Ṩ","ṩ","ẜ","ẝ","Ṫ","ṫ","Ṭ","ṭ","Ṯ","ṯ","Ṱ","ṱ","ẗ","Ṳ","ṳ","Ṵ","ṵ","Ṷ","ṷ","Ṹ","ṹ","Ṻ","ṻ","Ụ","ụ","Ủ","ủ","Ứ","ứ","Ừ","ừ","Ử","ử","Ữ","ữ","Ự","ự","Ư","ư","Ǖ","Ǘ","Ǚ","Ǜ","Ṽ","ṽ","Ṿ","ṿ","Ỽ","ỽ","Ẁ","ẁ","Ẃ","ẃ","Ẅ","ẅ","Ẇ","ẇ","Ẉ","ẉ","ẘ","Ẋ","ẋ","Ẍ","ẍ","Ẏ","ẏ","ẙ","Ỳ","ỳ","Ỵ","ỵ","Ỷ","ỷ","Ỹ","ỹ","Ỿ","ỿ","Ẑ","ẑ","Ẓ","ẓ","Ẕ","ẕ","Ǽ","ǽ","ẞ","ẟ"]},"ipa":{"labelMsg":"special-characters-group-ipa","layout":"characters","characters":["p","t̪","t","ʈ","c","k","q","ʡ","ʔ","b","d̪","d","ɖ","ɟ","ɡ","ɢ","ɓ","ɗ","ʄ","ɠ","ʛ","t͡s","t͡ʃ","t͡ɕ","d͡z","d͡ʒ","d͡ʑ","ɸ","f","θ","s","ʃ","ʅ","ʆ","ʂ","ɕ","ç","ɧ","x","χ","ħ","ʜ","h","β","v","ʍ","ð","z","ʒ","ʓ","ʐ","ʑ","ʝ","ɣ","ʁ","ʕ","ʖ","ʢ","ɦ","ɬ","ɮ","m","m̩","ɱ","ɱ̩","ɱ̍","n̪","n̪̍","n","n̩","ɳ","ɳ̩","ɲ","ɲ̩","ŋ","ŋ̍","ŋ̩","ɴ","ɴ̩","ʙ","ʙ̩","r","r̩","ʀ","ʀ̩","ɾ","ɽ","ɿ","ɺ","l̪","l̪̩","l","l̩","ɫ","ɫ̩","ɭ","ɭ̩","ʎ","ʎ̩","ʟ","ʟ̩","w","ɥ","ʋ","ɹ","ɻ","j","ɰ","ʘ","ǂ","ǀ","!","ǁ","ʰ","ʱ","ʷ","ʸ","ʲ","ʳ","ⁿ","ˡ","ʴ","ʵ","ˢ","ˣ","ˠ","ʶ","ˤ","ˁ","ˀ","ʼ","i","i̯","ĩ","y","y̯","ỹ","ɪ","ɪ̯","ɪ̃","ʏ","ʏ̯","ʏ̃","ɨ","ɨ̯","ɨ̃","ʉ","ʉ̯","ʉ̃","ɯ","ɯ̯","ɯ̃","u","u̯","ũ","ʊ","ʊ̯","ʊ̃","e","e̯","ẽ","ø","ø̯","ø̃","ɘ","ɘ̯","ɘ̃","ɵ","ɵ̯","ɵ̃","ɤ","ɤ̯","ɤ̃","o","o̯","õ","ɛ","ɛ̯","ɛ̃","œ","œ̯","œ̃","ɜ","ɜ̯","ɜ̃","ə","ə̯","ə̃","ɞ","ɞ̯","ɞ̃","ʌ","ʌ̯","ʌ̃","ɔ","ɔ̯","ɔ̃","æ","æ̯","æ̃","ɶ","ɶ̯","ɶ̃","a","a̯","ã","ɐ","ɐ̯","ɐ̃","ɑ","ɑ̯","ɑ̃","ɒ","ɒ̯","ɒ̃","ˈ","ˌ","ː","ˑ","˘",".","‿","|","‖","ɚ","ɝ"]},"symbols":{"labelMsg":"special-characters-group-symbols","layout":"characters","characters":["~","|","¡","¿","†","‡","↔","↑","↓","•","¶","#","½","⅓","⅔","¼","¾","⅛","⅜","⅝","⅞","∞","‘","’",{"label":"“”","action":{"type":"encapsulate","options":{"pre":"“","post":"”"}}},{"label":"„“","action":{"type":"encapsulate","options":{"pre":"„","post":"“"}}},{"label":"„”","action":{"type":"encapsulate","options":{"pre":"„","post":"”"}}},{"label":"«»","action":{"type":"encapsulate","options":{"pre":"«","post":"»"}}},{"label":"‹›","action":{"type":"encapsulate","options":{"pre":"‹","post":"›"}}},{"label":"⟨⟩","action":{"type":"encapsulate","options":{"pre":"⟨","post":"⟩"}}},"¤","₳","฿","₵","¢","₡","₢","$","₫","₯","€","₠","₣","ƒ","₴","₭","₤","ℳ","₥","₦","№","₧","₰","£","៛","₨","₪","৳","₮","₩","¥","♠","♣","♥","♦","m²","m³",{"label":"–","titleMsg":"special-characters-title-endash","action":{"type":"replace","options":{"peri":"–","selectPeri":false}}},{"label":"—","titleMsg":"special-characters-title-emdash","action":{"type":"replace","options":{"peri":"—","selectPeri":false}}},"…","‘","’","“","”","°","%","‰","′","″","≈","≠","≤","≥","±",{"label":"−","titleMsg":"special-characters-title-minus","action":{"type":"replace","options":{"peri":"−","selectPeri":false}}},"×","÷","←","→","·","§","‽"]},"greek":{"labelMsg":"special-characters-group-greek","layout":"characters","language":"el","characters":["Α","Ά","α","ά","Β","β","Γ","γ","Δ","δ","Ε","Έ","ε","έ","Ζ","ζ","Η","Ή","η","ή","Θ","θ","Ι","Ί","ι","ί","Κ","κ","Λ","λ","Μ","μ","Ν","ν","Ξ","ξ","Ο","Ό","ο","ό","Π","π","Ρ","ρ","Σ","σ","ς","Τ","τ","Υ","Ύ","υ","ύ","Φ","φ","Χ","χ","Ψ","ψ","Ω","Ώ","ω","ώ"]},"greekextended":{"labelMsg":"special-characters-group-greekextended","layout":"characters","characters":["ἀ","ἁ","ἂ","ἃ","ἄ","ἅ","ἆ","ἇ","Ἀ","Ἁ","Ἂ","Ἃ","Ἄ","Ἅ","Ἆ","Ἇ","ἐ","ἑ","ἒ","ἓ","ἔ","ἕ","Ἐ","Ἑ","Ἒ","Ἓ","Ἔ","Ἕ","ἠ","ἡ","ἢ","ἣ","ἤ","ἥ","ἦ","ἧ","Ἠ","Ἡ","Ἢ","Ἣ","Ἤ","Ἥ","Ἦ","Ἧ","ἰ","ἱ","ἲ","ἳ","ἴ","ἵ","ἶ","ἷ","Ἰ","Ἱ","Ἲ","Ἳ","Ἴ","Ἵ","Ἶ","Ἷ","ὀ","ὁ","ὂ","ὃ","ὄ","ὅ","Ὀ","Ὁ","Ὂ","Ὃ","Ὄ","Ὅ","ὐ","ὑ","ὒ","ὓ","ὔ","ὕ","ὖ","ὗ","Ὑ","Ὓ","Ὕ","Ὗ","ὠ","ὡ","ὢ","ὣ","ὤ","ὥ","ὦ","ὧ","Ὠ","Ὡ","Ὢ","Ὣ","Ὤ","Ὥ","Ὦ","Ὧ","ὰ","ά","ὲ","έ","ὴ","ή","ὶ","ί","ὸ","ό","ὺ","ύ","ὼ","ώ","ᾀ","ᾁ","ᾂ","ᾃ","ᾄ","ᾅ","ᾆ","ᾇ","ᾈ","ᾉ","ᾊ","ᾋ","ᾌ","ᾍ","ᾎ","ᾏ","ᾐ","ᾑ","ᾒ","ᾓ","ᾔ","ᾕ","ᾖ","ᾗ","ᾘ","ᾙ","ᾚ","ᾛ","ᾜ","ᾝ","ᾞ","ᾟ","ᾠ","ᾡ","ᾢ","ᾣ","ᾤ","ᾥ","ᾦ","ᾧ","ᾨ","ᾩ","ᾪ","ᾫ","ᾬ","ᾭ","ᾮ","ᾯ","ᾰ","ᾱ","ᾲ","ᾳ","ᾴ","ᾶ","ᾷ","Ᾰ","Ᾱ","Ὰ","Ά","ᾼ","᾽","ι","᾿","῀","῁","ῂ","ῃ","ῄ","ῆ","ῇ","Ὲ","Έ","Ὴ","Ή","ῌ","῍","῎","῏","ῐ","ῑ","ῒ","ΐ","ῖ","ῗ","Ῐ","Ῑ","Ὶ","Ί","῝","῞","῟","ῠ","ῡ","ῢ","ΰ","ῤ","ῥ","ῦ","ῧ","Ῠ","Ῡ","Ὺ","Ύ","Ῥ","῭","΅","`","ῲ","ῳ","ῴ","ῶ","ῷ","Ὸ","Ό","Ὼ","Ώ","ῼ","´","῾"]},"cyrillic":{"labelMsg":"special-characters-group-cyrillic","layout":"characters","characters":["А","а","Ӑ","ӑ","Ӓ","ӓ","Ә","ә","Ӛ","ӛ","Б","б","В","в","Г","г","Ґ","ґ","Ӷ","ӷ","Ѓ","ѓ","Ӻ","ӻ","Ғ","ғ","Ҕ","ҕ","Д","д","Ԁ","ԁ","Ԃ","ԃ","Ђ","ђ","Е","е","Ѐ","ѐ","Є","є","Ё","ё","Ӗ","ӗ","Ҽ","ҽ","Ҿ","ҿ","Ж","ж","Җ","җ","Ӂ","ӂ","Ӝ","ӝ","З","з","Ҙ","ҙ","Ӟ","ӟ","Ԑ","ԑ","Ӡ","ӡ","Ѕ","ѕ","Ԅ","ԅ","Ԇ","ԇ","И","и","І","і","Ї","ї",["◌Ӏ","Ӏ"],["◌ӏ","ӏ"],"Й","й","Ӣ","ӣ","Ѝ","ѝ","Ҋ","ҋ","Ӥ","ӥ","Ј","ј","К","к","Ќ","ќ","Қ","қ","Ҝ","ҝ","Ҟ","ҟ","Ҡ","ҡ","Ӄ","ӄ","Ԛ","ԛ","Л","л","Љ","љ","Ԉ","ԉ","Ԓ","ԓ","Ӆ","ӆ","М","м","Ӎ","ӎ","Н","н","Њ","њ","Ң","ң","Ҥ","ҥ","Ӈ","ӈ","Ԋ","ԋ","Ӊ","ӊ","О","о","Ҩ","ҩ","Ӧ","ӧ","Ө","ө","Ӫ","ӫ","П","п","Ԥ","ԥ","Ҧ","ҧ","Р","р","Ҏ","ҏ","С","с","Ҫ","ҫ","Т","т","Ћ","ћ","Ԍ","ԍ","Ҭ","ҭ","Ԏ","ԏ","У","у","Ў","ў","Ӯ","ӯ","Ӱ","ӱ","Ӳ","ӳ","Ү","ү","Ұ","ұ","Ф","ф","Х","х","Ҳ","ҳ","Ӽ","ӽ","Ӿ","ӿ","Һ","һ","Ц","ц","Ч","ч","Ҵ","ҵ","Ҷ","ҷ","Ҹ","ҹ","Ӌ","ӌ","Ӵ","ӵ","Џ","џ","Ш","ш","Щ","щ","Ъ","ъ","Ы","ы","Ӹ","ӹ","Ь","ь","Ҍ","ҍ","Э","э","Ӭ","ӭ","Ю","ю","Я","я","Ԝ","ԝ","Ѡ","ѡ","Ѣ","ѣ","Ѥ","ѥ","Ѧ","ѧ","Ѩ","ѩ","Ѫ","ѫ","Ѭ","ѭ","Ѯ","ѯ","Ѱ","ѱ","Ѳ","ѳ","Ѵ","ѵ","Ѷ","ѷ","Ѹ","ѹ","Ѻ","ѻ","Ѽ","ѽ","Ѿ","ѿ","Ҁ","ҁ"]},"arabic":{"labelMsg":"special-characters-group-arabic","layout":"characters","language":"ar","direction":"rtl","characters":["ا","ب","ت","ث","ج","ح","خ","د","ذ","ر","ز","س","ش","ص","ض","ط","ظ","ع","غ","ف","ق","ك","ل","م","ن","ه","و","ي","ء","آ","أ","إ","ٱ","ؤ","ئ","ى","ة","َ","ُ","ِ","ً","ٌ","ٍ","ّ","ْ","ٰ","،","؛","؟","ـ","٠","١","٢","٣","٤","٥","٦","٧","٨","٩","٪","٫","٬","٭",["zwnj","‌"],["zwj","‍"]]},"arabicextended":{"labelMsg":"special-characters-group-arabicextended","layout":"characters","language":"ar","direction":"rtl","characters":["ٲ","ٳ","ٴ","ٵ","ݳ","ݴ","ٮ","ٻ","پ","ڀ","ݐ","ݑ","ݒ","ݓ","ݔ","ݕ","ݖ","ٹ","ٺ","ټ","ٽ","ٿ","ځ","ڂ","ڃ","ڄ","څ","چ","ڇ","ڿ","ݗ","ݘ","ݮ","ݯ","ݲ","ݼ","ڈ","ډ","ڊ","ڋ","ڌ","ڍ","ڎ","ڏ","ڐ","ۮ","ݙ","ݚ","ڑ","ڒ","ړ","ڔ","ڕ","ږ","ڗ","ژ","ڙ","ۯ","ݛ","ݫ","ݬ","ݱ","ښ","ڛ","ڜ","ݽ","ۺ","ݜ","ݭ","ݰ","ݾ","ڝ","ڞ","ۻ","ڟ","ڠ","ݝ","ݞ","ݟ","ۼ","ڡ","ڢ","ڣ","ڤ","ڥ","ڦ","ݠ","ݡ","ٯ","ڧ","ڨ","ػ","ؼ","ک","ڪ","ګ","ڬ","ڭ","ڮ","گ","ڰ","ڱ","ڲ","ڳ","ڴ","ݢ","ݣ","ݤ","ݿ","ڵ","ڶ","ڷ","ڸ","ݪ","ݥ","ݦ","ڹ","ں","ڻ","ڼ","ڽ","ݧ","ݨ","ݩ","ھ","ۀ","ہ","ۂ","ۃ","ە","ۿ","ٶ","ٷ","ۄ","ۅ","ۆ","ۇ","ۈ","ۉ","ۊ","ۋ","ۏ","ݸ","ݹ","ؠ","ؽ","ؾ","ؿ","ٸ","ی","ۍ","ێ","ې","ۑ","ے","ۓ","ݵ","ݶ","ݷ","ݺ","ݻ","ٖ","ٗ","٘","ٙ","ٚ","ٛ","ٜ","ٝ","ٞ","ٟ","۔","۽","۾","۰","۱","۲","۳","۴","۵","۶","۷","۸","۹"]},"hebrew":{"labelMsg":"special-characters-group-hebrew","layout":"characters","direction":"rtl","characters":["א","ב","ג","ד","ה","ו","ז","ח","ט","י","כ","ך","ל","מ","ם","נ","ן","ס","ע","פ","ף","צ","ץ","ק","ר","ש","ת","װ","ױ","ײ","׳","״","־","–",{"label":"„”","action":{"type":"encapsulate","options":{"pre":"„","post":"”"}}},{"label":"‚’","action":{"type":"encapsulate","options":{"pre":"‚","post":"’"}}},["◌ְ","ְ"],["◌ֱ","ֱ"],["◌ֲ","ֲ"],["◌ֳ","ֳ"],["◌ִ","ִ"],["◌ֵ","ֵ"],["◌ֶ","ֶ"],["◌ַ","ַ"],["◌ָ","ָ"],["◌ֹ","ֹ"],["◌ֻ","ֻ"],["◌ּ","ּ"],["◌ׁ","ׁ"],["◌ׂ","ׂ"],["◌ׇ","ׇ"],["◌֑","֑"],["◌֒","֒"],["◌֓","֓"],["◌֔","֔"],["◌֕","֕"],["◌֖","֖"],["◌֗","֗"],["◌֘","֘"],["◌֙","֙"],["◌֚","֚"],["◌֛","֛"],["◌֜","֜"],["◌֝","֝"],["◌֞","֞"],["◌֟","֟"],["◌֠","֠"],["◌֡","֡"],["◌֢","֢"],["◌֣","֣"],["◌֤","֤"],["◌֥","֥"],["◌֦","֦"],["◌֧","֧"],["◌֨","֨"],["◌֩","֩"],["◌֪","֪"],["◌֫","֫"],["◌֬","֬"],["◌֭","֭"],["◌֮","֮"],["◌֯","֯"],["◌ֿ","ֿ"],["◌ֽ","ֽ"],["◌׀","׀"],["◌׃","׃"]]},"bangla":{"labelMsg":"special-characters-group-bangla","language":"bn","layout":"characters","characters":["ঀ","অ","আ","ই","ঈ","উ","ঊ","ঋ","ঌ","এ","ঐ","ও","ঔ","া","ি","ী","ু","ূ","ৃ","ে","ৈ","ো","ৌ","্য","্র","ক","খ","গ","ঘ","ঙ","চ","ছ","জ","ঝ","ঞ","ট","ঠ","ড","ঢ","ণ","ত","থ","দ","ধ","ন","প","ফ","ব","ভ","ম","য","র","ল","শ","ষ","স","হ","ড়","ঢ়","য়","ৎ","ং","ঃ","ঁ","্","৷","॥","১","২","৩","৪","৫","৬","৭","৮","৯","০","ঽ","ৗ","়","ৰ","ৱ","৲","৻","৳","৴","৵","৶","৷","৸","৹","৺","ৠ","ৡ","ৄ","ৢ","ৣ","‘","’","“","”",["zws","​"],["zwnj","‌"],["zwj","‍"]]},"tamil":{"labelMsg":"special-characters-group-tamil","language":"ta","layout":"characters","characters":["௦","௧","௨","௩","௪","௫","௬","௭","௮","௯","௰","௱","௲","௳","௴","௵","௶","௷","௸","௹","௺","ௐ"]},"telugu":{"labelMsg":"special-characters-group-telugu","language":"te","layout":"characters","characters":["ఁ","ం","ః","అ","ఆ","ఇ","ఈ","ఉ","ఊ","ఋ","ౠ","ఌ","ౡ","ఎ","ఏ","ఐ","ఒ","ఓ","ఔ","క","ఖ","గ","ఘ","ఙ","చ","ఛ","జ","ఝ","ఞ","ట","ఠ","డ","ఢ","ణ","త","థ","ద","ధ","న","ప","ఫ","బ","భ","మ","య","ర","ఱ","ల","ళ","వ","శ","ష","స","హ","ా","ి","ీ","ు","ూ","ృ","ౄ","ె","ే","ై","ొ","ో","ౌ","్","ౢ","ౣ","ౘ","ౙ","౦","౧","౨","౩","౪","౫","౬","౭","౮","౯","ఽ","౸","౹","౺","౻","౼","౽","౾","౿"]},"sinhala":{"labelMsg":"special-characters-group-sinhala","language":"si","layout":"characters","characters":["අ","ආ","ඇ","ඈ","ඉ","ඊ","උ","ඌ","ඍ","ඎ","ඏ","ඐ","එ","ඒ","ඓ","ඔ","ඕ","ඖ","ක","ඛ","ග","ඝ","ඞ","ඟ","ච","ඡ","ජ","ඣ","ඤ","ඥ","ඦ","ට","ඨ","ඩ","ඪ","ණ","ඬ","ත","ථ","ද","ධ","න","ඳ","ප","ඵ","බ","භ","ම","ඹ","ය","ර","ල","ව","ශ","ෂ","ස","හ","ළ","ෆ",["◌ා","ා"],["◌ැ","ැ"],["◌ෑ","ෑ"],["◌ි","ි"],["◌ී","ී"],["◌ු","ු"],["◌ූ","ූ"],["◌ෘ","ෘ"],["◌ෲ","ෲ"],["◌ෟ","ෟ"],["◌ෳ","ෳ"],["◌ෙ","ෙ"],["◌ේ","ේ"],["◌ො","ො"],["◌ෝ","ෝ"],["◌ෞ","ෞ"],["◌්","්"]]},"devanagari":{"labelMsg":"special-characters-group-devanagari","layout":"characters","characters":["ऀ","ँ","ं","ः","ऄ","अ","आ","इ","ई","उ","ऊ","ऋ","ऌ","ऍ","ऎ","ए","ऐ","ऑ","ऒ","ओ","औ","क","ख","ग","घ","ङ","च","छ","ज","झ","ञ","ट","ठ","ड","ढ","ण","त","थ","द","ध","न","ऩ","प","फ","ब","भ","म","य","र","ऱ","ल","ळ","ऴ","व","श","ष","स","ह","ऺ","ऻ","़","ऽ","ा","ि","ी","ु","ू","ृ","ॄ","ॅ","ॆ","े","ै","ॉ","ॊ","ो","ौ","्","ॎ","ॏ","ॐ","॑","॒","॓","॔","ॕ","ॖ","ॗ","क़","ख़","ग़","ज़","ड़","ढ़","फ़","य़","ॠ","ॡ","ॢ","ॣ","।","॥","०","१","२","३","४","५","६","७","८","९","॰","ॱ","ॲ","ॳ","ॴ","ॵ","ॶ","ॷ","ॹ","ॺ","ॻ","ॼ","ॽ","ॾ","ॿ"]},"gujarati":{"labelMsg":"special-characters-group-gujarati","language":"gu","layout":"characters","characters":["ૐ","ઁ","ં","ઃ","અ","આ","ઇ","ઈ","ઉ","ઊ","એ","ઐ","ઓ","ઔ","અં","ઋ","ઍ","ઑ","ઌ","ૠ","ૡ","ક","ખ","ગ","ઘ","ઙ","ચ","છ","જ","ઝ","ઞ","ટ","ઠ","ડ","ઢ","ણ","ત","થ","દ","ધ","ન","પ","ફ","બ","ભ","મ","ય","ર","લ","ળ","વ","શ","ષ","સ","હ","ક્ષ","જ્ઞ","ઽ","ા","િ","ી","ી","ુ","ૂ","ૃ","ૄ","ૅ","ે","ૈ","ૉ","ો","ૌ","ૢ","ૣ","્","૦","૧","૨","૩","૪","૫","૬","૭","૮","૯","૱"]},"thai":{"labelMsg":"special-characters-group-thai","language":"th","layout":"characters","characters":["ก","ข","ฃ","ค","ฅ","ฆ","ง","จ","ฉ","ช","ซ","ฌ","ญ","ฎ","ฏ","ฐ","ฑ","ฒ","ณ","ด","ต","ถ","ท","ธ","น","บ","ป","ผ","ฝ","พ","ฟ","ภ","ม","ย","ร","ฤ","ล","ฦ","ว","ศ","ษ","ส","ห","ฬ","อ","ฮ","ะ","ั","า","ๅ","ำ","ิ","ี","ึ","ื","ุ","ู","เ","แ","โ","ใ","ไ","็","่","้","๊","๋","์","ํ","ฺ","๎","๐","๑","๒","๓","๔","๕","๖","๗","๘","๙","฿","ๆ","ฯ","๚","๏","๛"]},"lao":{"labelMsg":"special-characters-group-lao","language":"lo","layout":"characters","characters":["ກ","ຂ","ຄ","ງ","ຈ","ສ","ຊ","ຍ","ດ","ຕ","ຖ","ທ","ນ","ບ","ປ","ຜ","ຝ","ພ","ຟ","ມ","ຢ","ລ","ວ","ຫ","ອ","ຮ","ຣ","ໜ","ໝ","ຼ","ຽ","ະ","ັ","າ","ຳ","ິ","ີ","ຶ","ື","ຸ","ູ","ົ","ເ","ແ","ໂ","ໃ","ໄ","່","້","໊","໋","໌","ໍ","໐","໑","໒","໓","໔","໕","໖","໗","໘","໙","₭","ໆ","ຯ"]},"khmer":{"labelMsg":"special-characters-group-khmer","language":"km","layout":"characters","characters":["ក","ខ","គ","ឃ","ង","ច","ឆ","ជ","ឈ","ញ","ដ","ឋ","ឌ","ឍ","ណ","ត","ថ","ទ","ធ","ន","ប","ផ","ព","ភ","ម","យ","រ","ល","វ","ស","ហ","ឡ","អ","ឣ","ឤ","ឥ","ឦ","ឧ","ឨ","ឩ","ឪ","ឫ","ឬ","ឭ","ឮ","ឯ","ឰ","ឱ","ឲ","ឳ","្","឴","឵","ា","ិ","ី","ឹ","ឺ","ុ","ូ","ួ","ើ","ឿ","ៀ","េ","ែ","ៃ","ោ","ៅ","ំ","ះ","ៈ","៉","៊","់","៌","៍","៎","៏","័","៑","៓","៝","ៜ","០","១","២","៣","៤","៥","៦","៧","៨","៩","៛","។","៕","៖","ៗ","៘","៙","៚","៰","៱","៲","៳","៴","៵","៶","៷","៸","៹","᧠","᧡","᧢","᧣","᧤","᧥","᧦","᧧","᧨","᧩","᧪","᧫","᧬","᧭","᧮","᧯","᧰","᧱","᧲","᧳","᧴","᧵","᧶","᧷","᧸","᧹","᧺","᧻","᧼","᧽","᧾","᧿"]},"canadianaboriginal":{"labelMsg":"special-characters-group-canadianaboriginal","language":"cr","layout":"characters","characters":["ᐁ","ᐂ","ᐃ","ᐄ","ᐅ","ᐆ","ᐇ","ᐈ","ᐉ","ᐊ","ᐋ","ᐌ","ᐍ","ᐎ","ᐏ","ᐐ","ᐑ","ᐒ","ᐓ","ᐔ","ᐕ","ᐖ","ᐗ","ᐘ","ᐙ","ᐚ","ᐛ","ᐜ","ᐝ","ᐞ","ᐟ","ᐠ","ᐡ","ᐢ","ᐣ","ᐤ","ᐥ","ᐦ","ᐧ","ᐨ","ᐩ","ᐪ","ᐫ","ᐬ","ᐭ","ᐮ","ᐯ","ᐰ","ᐱ","ᐲ","ᐳ","ᐴ","ᐵ","ᐶ","ᐷ","ᐸ","ᐹ","ᐺ","ᐻ","ᐼ","ᐽ","ᐾ","ᐿ","ᑀ","ᑁ","ᑂ","ᑃ","ᑄ","ᑅ","ᑆ","ᑇ","ᑈ","ᑉ","ᑊ","ᑋ","ᑌ","ᑍ","ᑎ","ᑏ","ᑐ","ᑑ","ᑒ","ᑓ","ᑔ","ᑕ","ᑖ","ᑗ","ᑘ","ᑙ","ᑚ","ᑛ","ᑜ","ᑝ","ᑞ","ᑟ","ᑠ","ᑡ","ᑢ","ᑣ","ᑤ","ᑥ","ᑦ","ᑧ","ᑨ","ᑩ","ᑪ","ᑫ","ᑬ","ᑭ","ᑮ","ᑯ","ᑰ","ᑱ","ᑲ","ᑳ","ᑴ","ᑵ","ᑶ","ᑷ","ᑸ","ᑹ","ᑺ","ᑻ","ᑼ","ᑽ","ᑾ","ᑿ","ᒀ","ᒁ","ᒂ","ᒃ","ᒄ","ᒅ","ᒆ","ᒇ","ᒈ","ᒉ","ᒊ","ᒋ","ᒌ","ᒍ","ᒎ","ᒏ","ᒐ","ᒑ","ᒒ","ᒓ","ᒔ","ᒕ","ᒖ","ᒗ","ᒘ","ᒙ","ᒚ","ᒛ","ᒜ","ᒝ","ᒞ","ᒟ","ᒠ","ᒡ","ᒢ","ᒣ","ᒤ","ᒥ","ᒦ","ᒧ","ᒨ","ᒩ","ᒪ","ᒫ","ᒬ","ᒭ","ᒮ","ᒯ","ᒰ","ᒱ","ᒲ","ᒳ","ᒴ","ᒵ","ᒶ","ᒷ","ᒸ","ᒹ","ᒺ","ᒻ","ᒼ","ᒽ","ᒾ","ᒿ","ᓀ","ᓁ","ᓂ","ᓃ","ᓄ","ᓅ","ᓆ","ᓇ","ᓈ","ᓉ","ᓊ","ᓋ","ᓌ","ᓍ","ᓎ","ᓏ","ᓐ","ᓑ","ᓒ","ᓓ","ᓔ","ᓕ","ᓖ","ᓗ","ᓘ","ᓙ","ᓚ","ᓛ","ᓜ","ᓝ","ᓞ","ᓟ","ᓠ","ᓡ","ᓢ","ᓣ","ᓤ","ᓥ","ᓦ","ᓧ","ᓨ","ᓩ","ᓪ","ᓫ","ᓬ","ᓭ","ᓮ","ᓯ","ᓰ","ᓱ","ᓲ","ᓳ","ᓴ","ᓵ","ᓶ","ᓷ","ᓸ","ᓹ","ᓺ","ᓻ","ᓼ","ᓽ","ᓾ","ᓿ","ᔀ","ᔁ","ᔂ","ᔃ","ᔄ","ᔅ","ᔆ","ᔇ","ᔈ","ᔉ","ᔊ","ᔋ","ᔌ","ᔍ","ᔎ","ᔏ","ᔐ","ᔑ","ᔒ","ᔓ","ᔔ","ᔕ","ᔖ","ᔗ","ᔘ","ᔙ","ᔚ","ᔛ","ᔜ","ᔝ","ᔞ","ᔟ","ᔠ","ᔡ","ᔢ","ᔣ","ᔤ","ᔥ","ᔦ","ᔧ","ᔨ","ᔩ","ᔪ","ᔫ","ᔬ","ᔭ","ᔮ","ᔯ","ᔰ","ᔱ","ᔲ","ᔳ","ᔴ","ᔵ","ᔶ","ᔷ","ᔸ","ᔹ","ᔺ","ᔻ","ᔼ","ᔽ","ᔾ","ᔿ","ᕀ","ᕁ","ᕂ","ᕃ","ᕄ","ᕅ","ᕆ","ᕇ","ᕈ","ᕉ","ᕊ","ᕋ","ᕌ","ᕍ","ᕎ","ᕏ","ᕐ","ᕑ","ᕒ","ᕓ","ᕔ","ᕕ","ᕖ","ᕗ","ᕘ","ᕙ","ᕚ","ᕛ","ᕜ","ᕝ","ᕞ","ᕟ","ᕠ","ᕡ","ᕢ","ᕣ","ᕤ","ᕥ","ᕦ","ᕧ","ᕨ","ᕩ","ᕪ","ᕫ","ᕬ","ᕭ","ᕮ","ᕯ","ᕰ","ᕱ","ᕲ","ᕳ","ᕴ","ᕵ","ᕶ","ᕷ","ᕸ","ᕹ","ᕺ","ᕻ","ᕼ","ᕽ","ᕾ","ᕿ","ᖀ","ᖁ","ᖂ","ᖃ","ᖄ","ᖅ","ᖆ","ᖇ","ᖈ","ᖉ","ᖊ","ᖋ","ᖌ","ᖍ","ᖎ","ᖏ","ᖐ","ᖑ","ᖒ","ᖓ","ᖔ","ᖕ","ᖖ","ᖗ","ᖘ","ᖙ","ᖚ","ᖛ","ᖜ","ᖝ","ᖞ","ᖟ","ᖠ","ᖡ","ᖢ","ᖣ","ᖤ","ᖥ","ᖦ","ᖧ","ᖨ","ᖩ","ᖪ","ᖫ","ᖬ","ᖭ","ᖮ","ᖯ","ᖰ","ᖱ","ᖲ","ᖳ","ᖴ","ᖵ","ᖶ","ᖷ","ᖸ","ᖹ","ᖺ","ᖻ","ᖼ","ᖽ","ᖾ","ᖿ","ᗀ","ᗁ","ᗂ","ᗃ","ᗄ","ᗅ","ᗆ","ᗇ","ᗈ","ᗉ","ᗊ","ᗋ","ᗌ","ᗍ","ᗎ","ᗏ","ᗐ","ᗑ","ᗒ","ᗓ","ᗔ","ᗕ","ᗖ","ᗗ","ᗘ","ᗙ","ᗚ","ᗛ","ᗜ","ᗝ","ᗞ","ᗟ","ᗠ","ᗡ","ᗢ","ᗣ","ᗤ","ᗥ","ᗦ","ᗧ","ᗨ","ᗩ","ᗪ","ᗫ","ᗬ","ᗭ","ᗮ","ᗯ","ᗰ","ᗱ","ᗲ","ᗳ","ᗴ","ᗵ","ᗶ","ᗷ","ᗸ","ᗹ","ᗺ","ᗻ","ᗼ","ᗽ","ᗾ","ᗿ","ᘀ","ᘁ","ᘂ","ᘃ","ᘄ","ᘅ","ᘆ","ᘇ","ᘈ","ᘉ","ᘊ","ᘋ","ᘌ","ᘍ","ᘎ","ᘏ","ᘐ","ᘑ","ᘒ","ᘓ","ᘔ","ᘕ","ᘖ","ᘗ","ᘘ","ᘙ","ᘚ","ᘛ","ᘜ","ᘝ","ᘞ","ᘟ","ᘠ","ᘡ","ᘢ","ᘣ","ᘤ","ᘥ","ᘦ","ᘧ","ᘨ","ᘩ","ᘪ","ᘫ","ᘬ","ᘭ","ᘮ","ᘯ","ᘰ","ᘱ","ᘲ","ᘳ","ᘴ","ᘵ","ᘶ","ᘷ","ᘸ","ᘹ","ᘺ","ᘻ","ᘼ","ᘽ","ᘾ","ᘿ","ᙀ","ᙁ","ᙂ","ᙃ","ᙄ","ᙅ","ᙆ","ᙇ","ᙈ","ᙉ","ᙊ","ᙋ","ᙌ","ᙍ","ᙎ","ᙏ","ᙐ","ᙑ","ᙒ","ᙓ","ᙔ","ᙕ","ᙖ","ᙗ","ᙘ","ᙙ","ᙚ","ᙛ","ᙜ","ᙝ","ᙞ","ᙟ","ᙠ","ᙡ","ᙢ","ᙣ","ᙤ","ᙥ","ᙦ","ᙧ","ᙨ","ᙩ","ᙪ","ᙫ","ᙬ","᙭","᙮","ᙯ","ᙰ","ᙱ","ᙲ","ᙳ","ᙴ","ᙵ","ᙶ"]}}},"help":{"labelMsg":"wikieditor-toolbar-section-help","type":"booklet","deferLoad":true,"pages":{"format":{"labelMsg":"wikieditor-toolbar-help-page-format","layout":"table","headings":[{"textMsg":"wikieditor-toolbar-help-heading-description"},{"textMsg":"wikieditor-toolbar-help-heading-syntax"},{"textMsg":"wikieditor-toolbar-help-heading-result"}],"rows":[{"description":{"htmlMsg":"wikieditor-toolbar-help-content-italic-description"},"syntax":{"htmlMsg":"wikieditor-toolbar-help-content-italic-syntax"},"result":{"htmlMsg":"wikieditor-toolbar-help-content-italic-result"}},{"description":{"htmlMsg":"wikieditor-toolbar-help-content-bold-description"},"syntax":{"htmlMsg":"wikieditor-toolbar-help-content-bold-syntax"},"result":{"htmlMsg":"wikieditor-toolbar-help-content-bold-result"}},{"description":{"htmlMsg":"wikieditor-toolbar-help-content-bolditalic-description"},"syntax":{"htmlMsg":"wikieditor-toolbar-help-content-bolditalic-syntax"},"result":{"htmlMsg":"wikieditor-toolbar-help-content-bolditalic-result"}}]},"link":{"labelMsg":"wikieditor-toolbar-help-page-link","layout":"table","headings":[{"textMsg":"wikieditor-toolbar-help-heading-description"},{"textMsg":"wikieditor-toolbar-help-heading-syntax"},{"textMsg":"wikieditor-toolbar-help-heading-result"}],"rows":[{"description":{"htmlMsg":"wikieditor-toolbar-help-content-ilink-description"},"syntax":{"htmlMsg":"wikieditor-toolbar-help-content-ilink-syntax"},"result":{"htmlMsg":"wikieditor-toolbar-help-content-ilink-result"}},{"description":{"htmlMsg":"wikieditor-toolbar-help-content-xlink-description"},"syntax":{"htmlMsg":"wikieditor-toolbar-help-content-xlink-syntax"},"result":{"htmlMsg":"wikieditor-toolbar-help-content-xlink-result"}}]},"heading":{"labelMsg":"wikieditor-toolbar-help-page-heading","layout":"table","headings":[{"textMsg":"wikieditor-toolbar-help-heading-description"},{"textMsg":"wikieditor-toolbar-help-heading-syntax"},{"textMsg":"wikieditor-toolbar-help-heading-result"}],"rows":[{"description":{"htmlMsg":"wikieditor-toolbar-help-content-heading2-description"},"syntax":{"htmlMsg":"wikieditor-toolbar-help-content-heading2-syntax"},"result":{"htmlMsg":"wikieditor-toolbar-help-content-heading2-result"}},{"description":{"htmlMsg":"wikieditor-toolbar-help-content-heading3-description"},"syntax":{"htmlMsg":"wikieditor-toolbar-help-content-heading3-syntax"},"result":{"htmlMsg":"wikieditor-toolbar-help-content-heading3-result"}},{"description":{"htmlMsg":"wikieditor-toolbar-help-content-heading4-description"},"syntax":{"htmlMsg":"wikieditor-toolbar-help-content-heading4-syntax"},"result":{"htmlMsg":"wikieditor-toolbar-help-content-heading4-result"}},{"description":{"htmlMsg":"wikieditor-toolbar-help-content-heading5-description"},"syntax":{"htmlMsg":"wikieditor-toolbar-help-content-heading5-syntax"},"result":{"htmlMsg":"wikieditor-toolbar-help-content-heading5-result"}}]},"list":{"labelMsg":"wikieditor-toolbar-help-page-list","layout":"table","headings":[{"textMsg":"wikieditor-toolbar-help-heading-description"},{"textMsg":"wikieditor-toolbar-help-heading-syntax"},{"textMsg":"wikieditor-toolbar-help-heading-result"}],"rows":[{"description":{"htmlMsg":"wikieditor-toolbar-help-content-ulist-description"},"syntax":{"htmlMsg":"wikieditor-toolbar-help-content-ulist-syntax"},"result":{"htmlMsg":"wikieditor-toolbar-help-content-ulist-result"}},{"description":{"htmlMsg":"wikieditor-toolbar-help-content-olist-description"},"syntax":{"htmlMsg":"wikieditor-toolbar-help-content-olist-syntax"},"result":{"htmlMsg":"wikieditor-toolbar-help-content-olist-result"}}]},"file":{"labelMsg":"wikieditor-toolbar-help-page-file","layout":"table","headings":[{"textMsg":"wikieditor-toolbar-help-heading-description"},{"textMsg":"wikieditor-toolbar-help-heading-syntax"},{"textMsg":"wikieditor-toolbar-help-heading-result"}],"rows":[{"description":{"htmlMsg":"wikieditor-toolbar-help-content-file-description"},"syntax":{"htmlMsg":["wikieditor-toolbar-help-content-file-syntax","Файл","мини","Пояснительный текст"]},"result":{"html":"<div class=\"thumbinner\" style=\"width: 102px;\"><a href=\"#\" class=\"image\"><img alt=\"\" src=\"/w/extensions/WikiEditor/modules/images/toolbar/example-image.png\" width=\"100\" height=\"50\" class=\"thumbimage\"/></a><div class=\"thumbcaption\"><div class=\"magnify\"><a title=\"Увеличить\" class=\"internal\" href=\"#\"></a></div>Пояснительный текст</div></div>"}}]},"reference":{"labelMsg":"wikieditor-toolbar-help-page-reference","layout":"table","headings":[{"textMsg":"wikieditor-toolbar-help-heading-description"},{"textMsg":"wikieditor-toolbar-help-heading-syntax"},{"textMsg":"wikieditor-toolbar-help-heading-result"}],"rows":[{"description":{"htmlMsg":"wikieditor-toolbar-help-content-reference-description"},"syntax":{"htmlMsg":"wikieditor-toolbar-help-content-reference-syntax"},"result":{"htmlMsg":"wikieditor-toolbar-help-content-reference-result"}},{"description":{"htmlMsg":"wikieditor-toolbar-help-content-named-reference-description"},"syntax":{"htmlMsg":"wikieditor-toolbar-help-content-named-reference-syntax"},"result":{"htmlMsg":"wikieditor-toolbar-help-content-named-reference-result"}},{"description":{"htmlMsg":"wikieditor-toolbar-help-content-rereference-description"},"syntax":{"htmlMsg":"wikieditor-toolbar-help-content-rereference-syntax"},"result":{"htmlMsg":"wikieditor-toolbar-help-content-rereference-result"}},{"description":{"htmlMsg":"wikieditor-toolbar-help-content-showreferences-description"},"syntax":{"htmlMsg":"wikieditor-toolbar-help-content-showreferences-syntax"},"result":{"htmlMsg":"wikieditor-toolbar-help-content-showreferences-result"}}]},"discussion":{"labelMsg":"wikieditor-toolbar-help-page-discussion","layout":"table","headings":[{"textMsg":"wikieditor-toolbar-help-heading-description"},{"textMsg":"wikieditor-toolbar-help-heading-syntax"},{"textMsg":"wikieditor-toolbar-help-heading-result"}],"rows":[{"description":{"htmlMsg":"wikieditor-toolbar-help-content-signaturetimestamp-description"},"syntax":{"htmlMsg":"wikieditor-toolbar-help-content-signaturetimestamp-syntax"},"result":{"htmlMsg":["wikieditor-toolbar-help-content-signaturetimestamp-result","Участник","Обсуждение участника"]}},{"description":{"htmlMsg":"wikieditor-toolbar-help-content-signature-description"},"syntax":{"htmlMsg":"wikieditor-toolbar-help-content-signature-syntax"},"result":{"htmlMsg":["wikieditor-toolbar-help-content-signature-result","Участник","Обсуждение участника"]}},{"description":{"htmlMsg":"wikieditor-toolbar-help-content-indent-description"},"syntax":{"htmlMsg":"wikieditor-toolbar-help-content-indent-syntax"},"result":{"htmlMsg":"wikieditor-toolbar-help-content-indent-result"}}]}}}}}
        );

        this.$element.find('.group-insert').remove();
        this.$element.find('.option[rel="heading-2"]').remove();

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
        const $a = $('<a>')
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
                post: text.includes('+') ? text.replace(/^.+?\+/, '') : '',
              }
            );
          })
        $insertButtons.append($a, ' ');
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
      cd.lastActiveMsgForm = this;
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

  showInfo(html, icon = 'info', className) {
    if (!className || !this.$infoArea.children('.cd-info-' + className).length) {
      const $textWithIcon = cd.env.createTextWithIcon(html, icon)
        .addClass('cd-info')
        .addClass('cd-info-' + icon);
      if (className) {
        $textWithIcon.addClass('cd-info-' + className);
      }

      this.$infoArea.cdAppend($textWithIcon, this.getTargetMsg(true));
    }
  }

  hideInfo(className) {
    const $info = this.$infoArea.children(`.cd-info-${className}`);
    if ($info.length) {
      $info.cdRemove(this.getTargetMsg(true));
    }
  }

  showWarning(html, className) {
    this.showInfo(html, 'alert', className);
  }

  hideWarning(className) {
    this.hideInfo(className);
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
        // We handle tables separately.
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
              !/(?:\x02|\x04|<\w+(?: [\w ]+?=[^<>]+?| ?\/?)>|<\/\w+ ?>|=|\])$/.test(m1) &&
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
          let msgCount;
          for (msgCount = 0; msgCount < 2; msgCount++) {
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
        summary: cd.env.formSummary(this.summaryInput.getValue()),
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

      // That's a hack used when we pass in keepedData a name of a topic that was set to be
      // watched/unwatched via a checkbox in a form just sent. The server doesn't manage to update
      // the value so quickly, so it returns the old value, but we must display the new one.
      let keepedData = {};
      if (this.watchTopicCheckbox) {
        if (this.watchTopicCheckbox.isSelected()) {
          const section = this.targetSection;
          if (section && !section.isWatched) {
            section.watch(true);
            keepedData.justWatchedTopic = section.heading;
          }
          if (this.mode === 'addSection' || this.mode === 'addSubsection') {
            const heading = cd.env.cleanSectionHeading(this.headingInput.getValue().trim());
            cd.env.watchTopic(heading, true);
            keepedData.justWatchedTopic = heading;
          }
        } else {
          const section = this.targetSection;
          if (section && section.isWatched) {
            section.unwatch(true);
            keepedData.justUnwatchedTopic = section.heading;
          }
        }
      }

      try {
        const data = await new mw.Api().postWithToken('csrf', {
          action: 'edit',
          title: cd.env.CURRENT_PAGE,
          summary: cd.env.formSummary(this.summaryInput.getValue()),
          text: newPageCode,
          basetimestamp: new Date(result.timestamp).toISOString(),
          starttimestamp: new Date(result.queryTimestamp).toISOString(),
          minor: this.minorCheckbox && this.minorCheckbox.isSelected(),
          watchlist: this.watchCheckbox.isSelected() ? 'watch' : 'unwatch',
          formatversion: 2,
        });
        if (!data.edit || !data.edit.result || data.edit.result !== 'Success') {
          let text;
          if (data.edit.spamblacklist) {
            text = 'Ошибка: адрес ' + data.edit.spamblacklist + ' находится в чёрном списке. Сообщение не отправлено.'
          } else {
            text = 'Неизвестная ошибка. Сообщение не отправлено. Подробности см. в консоли JavaScript (F12 → Консоль).';
            console.error('Содержимое объекта data.edit во время ошибки: ', data.edit);
          }
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
    // Some properties would be undefined in case of the message being edited and its code not
    // found.
    return ((this.originalText !== undefined &&
        this.originalText !== this.textarea.getValue()
    ) ||
      this.defaultSummary !== this.summaryInput.getValue() ||
      (this.headingInput &&
        this.originalHeadingText !== undefined &&
        this.originalHeadingText !== this.headingInput.getValue()
      )
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
