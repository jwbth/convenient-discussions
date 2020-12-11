/**
 * Timestamp regexp generator, timestamp parser generator, date formats, digits, and timezones.
 *
 * The code is based on {@link
 * https://gerrit.wikimedia.org/r/#/c/mediawiki/core/+/539305/3/signaturedetector.js}.
 *
 * @module dateFormat
 * @author Bartosz Dziewoński <matma.rex@gmail.com>
 * @license GPL-2.0-only
 */

import cd from './cd';
import { getMessages } from './util';

const DATE_FORMATS = {
  'ab': 'H:i, j xg Y',
  'abs': 'j F Y H.i',
  'ace': 'j F Y H.i',
  'ady-cyrl': 'H:i, j F Y',
  'aeb-arab': 'H:i، j xg Y',
  'aeb-latn': 'H:i, j F Y',
  'af': 'H:i, j F Y',
  'ais': 'H:i, j F Y',
  'ak': 'H:i, j F Y',
  'aln': 'j F Y H:i',
  'ami': 'H:i, j F Y',
  'am': 'H:i, j F Y',
  'ang': 'H:i, j F Y',
  'an': 'H:i j M Y',
  'anp': 'H:i, j F Y',
  'arc': 'H:i, j F Y',
  'ar': 'H:i، j xg Y',
  'arn': 'H:i j M Y',
  'arq': 'H:i، j xg Y',
  'ary': 'H:i, j F Y',
  'arz': 'H:i، j xg Y',
  'ase': 'H:i, j F Y',
  'as': 'H:i, j F Y',
  'ast': 'H:i j M Y',
  'atj': 'j F Y à H:i',
  'av': 'H:i, j xg Y',
  'avk': 'H:i, j F Y',
  'awa': 'H:i, j F Y',
  'ay': 'H:i j M Y',
  'azb': 'j xg Y، ساعت H:i',
  'az': 'H:i, j F Y',
  'ba': 'H:i, j xg Y',
  'ban': 'j F Y H.i',
  'bar': 'H:i, j. M Y',
  'bbc-latn': 'j F Y H.i',
  'bcc': 'j xg Y، ساعت H:i',
  'bcl': 'H:i, j F Y',
  'be': 'H:i, j xg Y',
  'be-tarask': 'H:i, j xg Y',
  'bg': 'H:i, j F Y',
  'bgn': 'j xg Y، ساعت H:i',
  'bho': 'H:i, j F Y',
  'bi': 'H:i, j F Y',
  'bjn': 'j F Y H.i',
  'bm': 'j F Y à H:i',
  'bn': 'H:i, j F Y',
  'bo': 'H:i, j F Y',
  'bpy': 'H:i, j F Y',
  'bqi': 'j xg Y، ساعت H:i',
  'brh': 'H:i, j F Y',
  'br': 'j M Y "da" H:i',
  'bs': 'H:i, j F Y',
  'btm': 'j F Y H.i',
  'bto': 'H:i, j F Y',
  'bug': 'j F Y H.i',
  'bxr': 'H:i, j xg Y',
  'ca': 'H:i, j M Y',
  'cbk-zam': 'H:i j M Y',
  'cdo': 'Y "nièng" n "nguŏk" j "hô̤" (D) H:i',
  'ceb': 'H:i, j F Y',
  'ce': 'Y, j F, H:i',
  'ch': 'H:i, j F Y',
  'chr': 'H:i, j F Y',
  'chy': 'H:i, j F Y',
  'ckb': 'H:i، jی xg Y',
  'co': 'H:i, j M Y',
  'cps': 'H:i, j F Y',
  'crh-cyrl': 'H:i, Y "с." xg j',
  'crh-latn': 'H:i, Y "s." xg j',
  'cr': 'H:i, j F Y',
  'csb': 'H:i, j M Y',
  'cs': 'j. n. Y, H:i',
  'cu': 'H:i, xg j числа, Y',
  'cv': 'H:i, j xg Y',
  'cy': 'H:i, j F Y',
  'da': 'j. M Y, H:i',
  'de-at': 'H:i, j. M Y',
  'de-ch': 'H:i, j. M Y',
  'de-formal': 'H:i, j. M Y',
  'de': 'H:i, j. M Y',
  'din': 'H:i, j F Y',
  'diq': 'H:i, j F Y',
  'dsb': 'j. xg Y, H:i',
  'dtp': 'H:i, j F Y',
  'dty': 'H:i, j F Y',
  'dv': 'H:i, j F Y',
  'dz': 'H:i, j F Y',
  'ee': 'H:i, j F Y',
  'egl': 'H:i, j M Y',
  'el': 'H:i, j xg Y',
  'eml': 'H:i, j M Y',
  'en-ca': 'H:i, j F Y',
  'en-gb': 'H:i, j F Y',
  'en': 'H:i, j F Y',
  'eo': 'H:i, j M. Y',
  'es-formal': 'H:i j M Y',
  'es': 'H:i j M Y',
  'et': 'j. F Y, "kell" H:i',
  'eu': 'H:i, j F Y',
  'exif': 'H:i, j F Y',
  'ext': 'H:i j M Y',
  'fa': 'j xg Y، ساعت H:i',
  'ff': 'j F Y à H:i',
  'fi': 'j. F"ta" Y "kello" H.i',
  'fit': 'j. F"ta" Y "kello" H.i',
  'fj': 'H:i, j F Y',
  'fo': 'j. M Y "kl." H:i',
  'frc': 'j F Y à H:i',
  'fr': 'j F Y à H:i',
  'frp': 'j F Y "a" H:i',
  'frr': 'H:i, j. M Y',
  'fur': 'j "di" M Y "a lis" H:i',
  'fy': 'j M Y, H.i',
  'gag': 'H.i, j F Y',
  'ga': 'H:i, j F Y',
  'gan-hans': 'Y年n月j日 (D) H:i',
  'gan-hant': 'Y年n月j日 (D) H:i',
  'gan': 'Y年n月j日 (D) H:i',
  'gcr': 'j F Y à H:i',
  'gd': 'H:i, j F Y',
  'gl': 'j \\d\\e F \\d\\e Y "ás" H:i',
  'glk': 'j xg Y، ساعت H:i',
  'gn': 'H:i j M Y',
  'gom': 'H:i, j F Y',
  'gom-deva': 'H:i, j F Y',
  'gom-latn': 'H:i, j F Y',
  'gor': 'j F Y H.i',
  'got': 'H:i, j F Y',
  'grc': 'H:i, j xg Y',
  'gsw': 'H:i, j. M Y',
  'gu': 'H:i, j F Y',
  'gv': 'H:i, j F Y',
  'ha': 'H:i, j F Y',
  'hak': 'H:i, j F Y',
  'haw': 'H:i, j F Y',
  'he': 'H:i, j xg Y',
  'hif-latn': 'H:i, j F Y',
  'hi': 'H:i, j F Y',
  'hil': 'H:i, j F Y',
  'hr': 'H:i, j. F Y.',
  'hrx': 'H:i, j. M Y',
  'hsb': 'j. xg Y, H:i',
  'ht': 'j F Y à H:i',
  'hu-formal': 'Y. F j., H:i',
  'hu': 'Y. F j., H:i',
  'hy': 'H:i, j xg Y',
  'hyw': 'H:i, j xg Y',
  'ia': 'H:i, j F Y',
  'id': 'j F Y H.i',
  'ie': 'H:i, j F Y',
  'ig': 'H:i, j F Y',
  'ii': 'Y年n月j日 (D) H:i',
  'ike-cans': 'H:i, j F Y',
  'ike-latn': 'H:i, j F Y',
  'ik': 'H:i, j F Y',
  'ilo': 'H:i, j F Y',
  'inh': 'H:i, j xg Y',
  'io': 'H:i, j M. Y',
  'is': 'j. F Y "kl." H:i',
  'it': 'H:i, j M Y',
  'ja': 'Y年n月j日 (D) H:i',
  'jam': 'H:i, j F Y',
  'jbo': 'H:i, j F Y',
  'jut': 'j. M Y, H:i',
  'jv': 'j F Y H.i',
  'kaa': 'H:i, Y "j." xg j',
  'kab': 'H:i, j F Y',
  'ka': 'H:i, j F Y',
  'kbd-cyrl': 'H:i, j F Y',
  'kbp': 'j F Y à H:i',
  'kg': 'H:i, j F Y',
  'khw': 'H:i، j xg Yء',
  'ki': 'H:i, j F Y',
  'kiu': 'H.i, j F Y',
  'kjp': ' H:i"၊" j F Y',
  'kk-arab': 'H:i، Y "ج." xg j',
  'kk-cyrl': 'H:i, Y "ж." xg j',
  'kk': 'H:i, Y "ж." xg j',
  'kk-latn': 'H:i, Y "j." xg j',
  'kl': 'j. M Y, H:i',
  'km': 'មោងH:i l ទd F ឆ្នាY',
  'kn': 'H:i, j F Y',
  'krc': 'H:i, j xg Y',
  'kri': 'H:i, j F Y',
  'krj': 'H:i, j F Y',
  'krl': 'j. F"ta" Y "kello" H.i',
  'ks-arab': 'H:i, j F Y',
  'ks-deva': 'H:i, j F Y',
  'ksh': 'H:i, j. M Y',
  'ks': 'H:i, j F Y',
  'ku-arab': 'H:i، jی xg Y',
  'ku-latn': 'H:i, j F Y',
  'kum': 'H:i, j xg Y',
  'kv': 'H:i, j xg Y',
  'kw': 'H:i, j F Y',
  'ky': 'H:i, j F Y',
  'lad': 'H:i j M Y',
  'la': 'H:i, j xg Y',
  'lbe': 'H:i, j xg Y',
  'lb': 'H:i, j. M Y',
  'lez': 'H:i, j xg Y',
  'lfn': 'H:i, j F Y',
  'lg': 'H:i, j F Y',
  'lij': 'H:i, j M Y',
  'li': 'j M Y H:i',
  'liv': 'j. F Y, "kell" H:i',
  'lki': 'j xg Y، ساعت H:i',
  'lmo': 'H:i, j M Y',
  'ln': 'j F Y à H:i',
  'lo': 'H:i, j F Y',
  'loz': 'H:i, j F Y',
  'lrc': 'j xg Y، ساعت H:i',
  'ltg': 'Y". gada" j. F", plkst." H.i',
  'lt': 'H:i, j F Y',
  'lus': 'H:i, j F Y',
  'luz': 'j xg Y، ساعت H:i',
  'lv': 'Y". gada" j. F", plkst." H.i',
  'lzh': 'Y年n月j日 （D） H時i分',
  'lzz': 'H.i, j F Y',
  'mai': 'H:i, j F Y',
  'map-bms': 'j F Y H.i',
  'mdf': 'H:i, j xg Y',
  'mg': 'j F Y à H:i',
  'mhr': 'H:i, j xg Y',
  'mi': 'H:i, j F Y',
  'min': 'j F Y H.i',
  'mk': 'H:i, j F Y',
  'ml': 'H:i, j F Y',
  'mni': 'H:i, j F Y',
  'mn': 'H:i, j F Y',
  'mnw': ' H:i"၊" j F Y',
  'mo': 'j F Y H:i',
  'mrj': 'H:i, j xg Y',
  'mr': 'H:i, j F Y',
  'ms': 'H:i, j F Y',
  'mt': 'H:i, j F Y',
  'mwl': 'H\\hi\\m\\i\\n \\d\\e j \\d\\e F \\d\\e Y',
  'my': ' H:i"၊" j F Y',
  'myv': 'H:i, j xg Y',
  'mzn': 'j xg Y، ساعت H:i',
  'nah': 'H:i j M Y',
  'na': 'H:i, j F Y',
  'nan': 'Y-"nî" n-"goe̍h" j-"ji̍t" (D) H:i',
  'nap': 'H:i, j M Y',
  'nb': 'j. M Y "kl." H:i',
  'nds': 'H:i, j. M Y',
  'nds-nl': 'H:i, j M Y',
  'ne': 'H:i, j F Y',
  'new': 'H:i, j F Y',
  'niu': 'H:i, j F Y',
  'nl-informal': 'j M Y H:i',
  'nl': 'j M Y H:i',
  'nn': 'j. F Y "kl." H:i',
  'nov': 'H:i, j F Y',
  'nqo': 'H:i, j F Y',
  'nrm': 'j F Y à H:i',
  'nso': 'H:i, j F Y',
  'nv': 'H:i, j F Y',
  'ny': 'H:i, j F Y',
  'nys': 'H:i, j F Y',
  'oc': 'j F "de" Y "a" H.i',
  'olo': 'j. F"ta" Y "kello" H.i',
  'om': 'H:i, j F Y',
  'or': 'H:i, j F Y',
  'os': 'H:i, j xg Y',
  'pag': 'H:i, j F Y',
  'pa': 'H:i, j F Y',
  'pam': 'H:i, j F Y',
  'pap': 'H:i, j F Y',
  'pcd': 'j F Y à H:i',
  'pdc': 'H:i, j. M Y',
  'pdt': 'H:i, j. M Y',
  'pfl': 'H:i, j. M Y',
  'pih': 'H:i, j F Y',
  'pi': 'H:i, j F Y',
  'pl': 'H:i, j M Y',
  'pms': 'H:i, j M Y',
  'pnb': 'H:i, j F Y',
  'pnt': 'H:i, j xg Y',
  'prg': 'H:i, j F Y',
  'ps': 'H:i, j F Y',
  'pt-br': 'H"h"i"min" "de" j "de" F "de" Y',
  'pt': 'H\\hi\\m\\i\\n \\d\\e j \\d\\e F \\d\\e Y',
  'qqq': 'H:i, j F Y',
  'qug': 'H:i j M Y',
  'qu': 'H:i j M Y',
  'rgn': 'H:i, j M Y',
  'rif': 'H:i, j F Y',
  'rm': 'H:i, j F Y',
  'rmy': 'j F Y H:i',
  'roa-tara': 'H:i, j M Y',
  'ro': 'j F Y H:i',
  'rue': 'H:i, j xg Y',
  'ru': 'H:i, j xg Y',
  'rup': 'j F Y H:i',
  'ruq-cyrl': 'H:i, j F Y',
  'ruq-latn': 'j F Y H:i',
  'rw': 'H:i, j F Y',
  'sah': 'H:i, j xg Y',
  'sa': 'H:i, j F Y',
  'sat': 'H:i, j F Y',
  'sc': 'H:i, j M Y',
  'scn': 'H:i, j M Y',
  'sco': 'H:i, j F Y',
  'sdc': 'H:i, j F Y',
  'sdh': 'j xg Y، ساعت H:i',
  'sd': 'H:i, j F Y',
  'sei': 'H:i, j F Y',
  'se': 'xg j "b." Y "dii." G.i',
  'ses': 'j F Y à H:i',
  'sg': 'j F Y à H:i',
  'sgs': 'H:i, j F Y',
  'shi': 'H:i, j F Y',
  'sh': 'H:i, j F Y',
  'shn': 'H:i, j F Y',
  'shy-latn': 'H:i, j F Y',
  'si': 'H:i, j F Y',
  'sk': 'H:i, j. F Y',
  'skr-arab': 'H:i، j xg Yء',
  'sli': 'H:i, j. M Y',
  'sl': 'H:i, j. F Y',
  'sma': 'H:i, j F Y',
  'sm': 'H:i, j F Y',
  'sn': 'H:i, j F Y',
  'so': 'H:i, j F Y',
  'sq': 'j F Y H:i',
  'sr-ec': 'H:i, j. F Y.',
  'sr-el': 'H:i, j. F Y.',
  'srn': 'j M Y H:i',
  'ss': 'H:i, j F Y',
  'st': 'H:i, j F Y',
  'stq': 'H:i, j. M Y',
  'sty': 'H:i, j xg Y',
  'su': 'j F Y H.i',
  'sv': 'j F Y "kl." H.i',
  'sw': 'H:i, j F Y',
  'szl': 'H:i, j M Y',
  'ta': 'H:i, j F Y',
  'tay': 'H:i, j F Y',
  'tcy': 'H:i, j F Y',
  'te': 'H:i, j F Y',
  'tet': 'H\\hi\\m\\i\\n \\d\\e j \\d\\e F \\d\\e Y',
  'tg-cyrl': 'H:i, j xg Y',
  'tg-latn': 'H:i, j F Y',
  'th': 'H:i, j F xkY',
  'ti': 'H:i, j F Y',
  'tk': 'H:i, j F Y',
  'tl': 'H:i, j F Y',
  'tly': 'H:i, j F Y',
  'tn': 'H:i, j F Y',
  'to': 'H:i, j F Y',
  'tpi': 'H:i, j F Y',
  'tr': 'H.i, j F Y',
  'tru': 'H:i, j F Y',
  'trv': 'H:i, j F Y',
  'ts': 'H:i, j F Y',
  'tt-cyrl': 'j M Y, H:i',
  'tt-latn': 'j M Y, H:i',
  'tw': 'H:i, j F Y',
  'ty': 'j F Y à H:i',
  'tyv': 'H:i, j xg Y',
  'tzm': 'H:i, j F Y',
  'udm': 'H:i, j xg Y',
  'ug-arab': 'H:i, j F Y',
  'ug-latn': 'H:i, j F Y',
  'uk': 'H:i, j xg Y',
  'ur': 'H:i، j xg Yء',
  'uz': 'H:i, j-F Y',
  'vec': 'H:i, j M Y',
  've': 'H:i, j F Y',
  'vep': 'j. F Y, "kell" H:i',
  'vi': 'H:i, "ngày" j "tháng" n "năm" Y',
  'vls': 'j M Y H:i',
  'vmf': 'H:i, j. M Y',
  'vo': 'H:i, Y F j"id"',
  'vot': 'j. F"ta" Y "kello" H.i',
  'vro': 'j. F Y, "kell" H:i',
  'wa': 'j F Y à H:i',
  'war': 'H:i, j F Y',
  'wo': 'j F Y à H:i',
  'wuu': 'Y年n月j号 (D) H:i',
  'xal': 'H:i, j xg Y',
  'xh': 'H:i, j F Y',
  'xmf': 'H:i, j F Y',
  'xsy': 'H:i, j F Y',
  'yi': 'H:i, j xg Y',
  'yo': 'H:i, j F Y',
  'yue': 'Y年n月j號 (D) H:i',
  'za': 'Y年n月j日 (D) H:i',
  'zea': 'j M Y H:i',
  'zgh': 'H:i, j F Y',
  'zh-hans': 'Y年n月j日 (D) H:i',
  'zh-hant': 'Y年n月j日 (D) H:i',
  'zh-hk': 'Y年n月j日 (D) H:i',
  'zh': 'Y年n月j日 (D) H:i',
  'zh-sg': 'Y年n月j日 (D) H:i',
  'zh-tw': 'Y年n月j日 (D) H:i',
  'zu': 'H:i, j F Y',
};

const DIGITS = {
  'aeb-arab': '٠١٢٣٤٥٦٧٨٩',
  'anp': '०१२३४५६७८९',
  'ar': '٠١٢٣٤٥٦٧٨٩',
  'as': '০১২৩৪৫৬৭৮৯',
  'azb': '۰۱۲۳۴۵۶۷۸۹',
  'bcc': '۰۱۲۳۴۵۶۷۸۹',
  'bgn': '۰۱۲۳۴۵۶۷۸۹',
  'bho': '०१२३४५६७८९',
  'bn': '০১২৩৪৫৬৭৮৯',
  'bo': '༠༡༢༣༤༥༦༧༨༩',
  'bpy': '০১২৩৪৫৬৭৮৯',
  'bqi': '۰۱۲۳۴۵۶۷۸۹',
  'ckb': '٠١٢٣٤٥٦٧٨٩',
  'dty': '०१२३४५६७८९',
  'dz': '༠༡༢༣༤༥༦༧༨༩',
  'fa': '۰۱۲۳۴۵۶۷۸۹',
  'glk': '۰۱۲۳۴۵۶۷۸۹',
  'gom-deva': '०१२३४५६७८९',
  'gu': '૦૧૨૩૪૫૬૭૮૯',
  'hi': '०१२३४५६७८९',
  'kjp': '၀၁၂၃၄၅၆၇၈၉',
  'kk-arab': '۰۱۲۳۴۵۶۷۸۹',
  'km': '០១២៣៤៥៦៧៨៩',
  'kn': '೦೧೨೩೪೫೬೭೮೯',
  'ks-arab': '٠١٢٣٤٥٦٧٨٩',
  'ks-deva': '०१२३४५६७८९',
  'ks': '٠١٢٣٤٥٦٧٨٩',
  'ku-arab': '٠١٢٣٤٥٦٧٨٩',
  'lki': '۰۱۲۳۴۵۶۷۸۹',
  'lo': '໐໑໒໓໔໕໖໗໘໙',
  'lrc': '۰۱۲۳۴۵۶۷۸۹',
  'luz': '۰۱۲۳۴۵۶۷۸۹',
  'lzh': '〇一二三四五六七八九',
  'mai': '०१२३४५६७८९',
  'mni': '꯰꯱꯲꯳꯴꯵꯶꯷꯸꯹',
  'mnw': '၀၁၂၃၄၅၆၇၈၉',
  'mr': '०१२३४५६७८९',
  'my': '၀၁၂၃၄၅၆၇၈၉',
  'mzn': '۰۱۲۳۴۵۶۷۸۹',
  'ne': '०१२३४५६७८९',
  'new': '०१२३४५६७८९',
  'nqo': '߀߁߂߃߄߅߆߇߈߉',
  'or': '୦୧୨୩୪୫୬୭୮୯',
  'pi': '०१२३४५६७८९',
  'ps': '۰۱۲۳۴۵۶۷۸۹',
  'sa': '०१२३४५६७८९',
  'sat': '᱐᱑᱒᱓᱔᱕᱖᱗᱘᱙',
  'sdh': '۰۱۲۳۴۵۶۷۸۹',
  'skr-arab': '٠١٢٣٤٥٦٧٨٩',
  'tcy': '೦೧೨೩೪೫೬೭೮೯',
};

const TIMEZONES = [
  'acdt', 'acst', 'act', 'acwdt', 'acwst', 'addt', 'adt', 'aedt', 'aest', 'aft', 'ahdt', 'ahst',
  'akdt', 'akst', 'amst', 'amt', 'ant', 'apt', 'arst', 'art', 'ast', 'awdt', 'awst', 'awt', 'azomt',
  'azost', 'azot', 'bdst', 'bdt', 'beat', 'beaut', 'bmt', 'bnt', 'bortst', 'bort', 'bost', 'bot',
  'brst', 'brt', 'bst', 'btt', 'burt', 'cant', 'capt', 'cast', 'cat', 'cawt', 'cct', 'cddt', 'cdt',
  'cemt', 'cest', 'cet', 'cgst', 'cgt', 'chadt', 'chast', 'chdt', 'chost', 'chot', 'chut', 'ckhst',
  'ckt', 'clst', 'clt', 'cmt', 'cost', 'cot', 'cpt', 'cst', 'cut', 'cvst', 'cvt', 'cwt', 'cxt',
  'chst', 'dact', 'dmt', 'easst', 'east', 'eat', 'ect', 'eddt', 'edt', 'eest', 'eet', 'egst', 'egt',
  'ehdt', 'emt', 'ept', 'est', 'ewt', 'ffmt', 'fjst', 'fjt', 'fkst', 'fkt', 'fmt', 'fnst', 'fnt',
  'galt', 'gamt', 'gbgt', 'gft', 'ghst', 'gilt', 'gmt', 'gst', 'gyt', 'hdt', 'hkst', 'hkt', 'hmt',
  'hovst', 'hovt', 'hst', 'ict', 'iddt', 'idt', 'ihst', 'imt', 'iot', 'irdt', 'irst', 'isst', 'ist',
  'javt', 'jcst', 'jdt', 'jmt', 'jst', 'jwst', 'kart', 'kdt', 'kmt', 'kost', 'kst', 'kwat', 'lhdt',
  'lhst', 'lint', 'lkt', 'lrt', 'lst', 'madmt', 'madst', 'madt', 'malst', 'malt', 'mart', 'mddt',
  'mdst', 'mdt', 'mest', 'met', 'mht', 'mist', 'mmt', 'most', 'mot', 'mpt', 'msd', 'msk', 'mst',
  'must', 'mut', 'mvt', 'mwt', 'myt', 'ncst', 'nct', 'nddt', 'ndt', 'negt', 'nest', 'net', 'nfst',
  'nft', 'nmt', 'npt', 'nrt', 'nst', 'nut', 'nwt', 'nzdt', 'nzmt', 'nzst', 'pddt', 'pdt', 'pest',
  'pet', 'pgt', 'phot', 'phst', 'pht', 'pkst', 'pkt', 'plmt', 'pmdt', 'pmmt', 'pmst', 'pmt', 'pnt',
  'pont', 'ppmt', 'ppt', 'pst', 'pwt', 'pyst', 'pyt', 'qmt', 'ret', 'rmt', 'sast', 'sbt', 'sct',
  'sdmt', 'sdt', 'set', 'sgt', 'sjmt', 'smt', 'srt', 'sst', 'swat', 'taht', 'tbmt', 'tkt', 'tlt',
  'tmt', 'tost', 'tot', 'tvt', 'uct', 'ulast', 'ulat', 'utc', 'uyhst', 'uyst', 'uyt', 'vet', 'vust',
  'vut', 'wakt', 'warst', 'wart', 'wast', 'wat', 'wemt', 'west', 'wet', 'wft', 'wgst', 'wgt', 'wib',
  'wita', 'wit', 'wmt', 'wsdt', 'wsst', 'xjt', 'yddt', 'ydt', 'ypt', 'yst', 'ywt', 'a', 'b', 'c',
  'd', 'e', 'f', 'g', 'h', 'i', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w',
  'x', 'y', 'z'
];

/**
 * Set the global variables related to date format.
 *
 * @private
 */
function setFormats() {
  const langCode = mw.config.get('wgContentLanguage');
  cd.g.DATE_FORMAT = DATE_FORMATS[langCode];
  cd.g.DIGITS = mw.config.get('wgTranslateNumerals') ? DIGITS[langCode] : null;
}

/**
 * Load messages needed to parse and generate timestamps, as well as some site data.
 *
 * @returns {Promise}
 */
export function loadData() {
  const requests = [];

  mw.messages.set(cd.config.messages);

  cd.g.CONTRIBS_PAGE = cd.config.contribsPage;
  cd.g.LOCAL_TIMEZONE_OFFSET = cd.config.localTimezoneOffset;

  const messageNames = [
    'sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat',

    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',

    'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',

    'january', 'february', 'march', 'april', 'may_long', 'june', 'july', 'august', 'september',
    'october', 'november', 'december',

    'january-gen', 'february-gen', 'march-gen', 'april-gen', 'may-gen', 'june-gen', 'july-gen',
    'august-gen', 'september-gen', 'october-gen', 'november-gen', 'december-gen',

    'parentheses', 'parentheses-start', 'parentheses-end', 'word-separator', 'comma-separator',
    'colon-separator', 'dot-separator',
  ];

  cd.g.api = cd.g.api || new mw.Api();

  // I hope we won't be scolded too much for making two message requests in parallel.
  const messagesRequests = [];
  for (let i = 0; i < messageNames.length; i += 50) {
    const nextNames = messageNames.slice(i, i + 50);
    const request = cd.g.api.loadMessagesIfMissing(nextNames, {
      amlang: mw.config.get('wgContentLanguage'),
    });
    messagesRequests.push(request);
  }

  if (!Object.keys(cd.config.messages).some((name) => name.startsWith('timezone-'))) {
    const request = cd.g.api.loadMessages(undefined, {
      amlang: mw.config.get('wgContentLanguage'),
      amincludelocal: 1,
      amfilter: 'timezone-',
    });
    messagesRequests.push(request);
  }

  Promise.all(messagesRequests).then(() => {
    cd.g.messages = {};

    // We need this object to pass to the web worker.
    messageNames.push(
      ...Object.keys(mw.messages.get()).filter((name) => name.startsWith('timezone-'))
    );
    messageNames.forEach((name) => {
      cd.g.messages[name] = mw.messages.get(name);
    });
  });
  requests.push(...messagesRequests);

  if (!cd.g.CONTRIBS_PAGE || cd.g.LOCAL_TIMEZONE_OFFSET === null) {
    const request = cd.g.api.get({
      action: 'query',
      meta: 'siteinfo',
      siprop: ['specialpagealiases', 'general'],
    }).then((resp) => {
      resp.query.specialpagealiases.some((alias) => {
        if (alias.realname === 'Contributions') {
          cd.g.CONTRIBS_PAGE = mw.config.get('wgFormattedNamespaces')[-1] + ':' + alias.aliases[0];
          return true;
        }
      });
      // TODO: Implement DST offsets
      cd.g.LOCAL_TIMEZONE_OFFSET = resp.query.general.timeoffset;
    });
    requests.push(request);
  }

  return Promise.all(requests);
}

/**
 * Get a regexp that matches timestamps (without timezone at the end) generated using the given date
 * format.
 *
 * This only supports format characters that are used by the default date format in any of
 * MediaWiki's languages, namely: D, d, F, G, H, i, j, l, M, n, Y, xg, xkY (and escape characters),
 * and only dates when MediaWiki existed, let's say 2000 onwards (Thai dates before 1941 are
 * complicated).
 *
 * @param {string} format Date format, as used by MediaWiki.
 * @param {string} digits Regular expression matching a single localized digit, e.g. `[0-9]`.
 * @returns {string} Pattern to be a part of a regular expression.
 * @private
 */
function getTimestampMainPartPattern(format, digits) {
  const regexpGroup = (regexp) => '(' + regexp + ')';
  const regexpAlternateGroup = (arr) => '(' + arr.map(mw.util.escapeRegExp).join('|') + ')';

  let s = '\\b';

  for (let p = 0; p < format.length; p++) {
    let num = false;
    let code = format[p];
    if (code === 'x' && p < format.length - 1) {
      code += format[++p];
    }
    if (code === 'xk' && p < format.length - 1) {
      code += format[++p];
    }

    switch (code) {
      case 'xx':
        s += 'x';
        break;
      case 'xg':
        s += regexpAlternateGroup(getMessages([
          'january-gen', 'february-gen', 'march-gen', 'april-gen', 'may-gen', 'june-gen',
          'july-gen', 'august-gen', 'september-gen', 'october-gen', 'november-gen', 'december-gen'
        ]));
        break;
      case 'd':
        num = '2';
        break;
      case 'D':
        s += regexpAlternateGroup(getMessages(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']));
        break;
      case 'j':
        num = '1,2';
        break;
      case 'l':
        s += regexpAlternateGroup(getMessages([
          'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
        ]));
        break;
      case 'F':
        s += regexpAlternateGroup(getMessages([
          'january', 'february', 'march', 'april', 'may_long', 'june', 'july', 'august',
          'september', 'october', 'november', 'december'
        ]));
        break;
      case 'M':
        s += regexpAlternateGroup(getMessages([
          'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
        ]));
        break;
      case 'n':
        num = '1,2';
        break;
      case 'Y':
        num = '4';
        break;
      case 'xkY':
        num = '4';
        break;
      case 'G':
        num = '1,2';
        break;
      case 'H':
        num = '2';
        break;
      case 'i':
        num = '2';
        break;
      case '\\':
        // Backslash escaping
        if (p < format.length - 1) {
          s += format[++p];
        } else {
          s += '\\';
        }
        break;
      case '"':
        // Quoted literal
        if (p < format.length - 1) {
          const endQuote = format.indexOf('"', p + 1)
          if (endQuote === -1) {
            // No terminating quote, assume literal "
            s += '"';
          } else {
            s += format.substr(p + 1, endQuote - p - 1);
            p = endQuote;
          }
        } else {
          // Quote at end of string, assume literal "
          s += '"';
        }
        break;
      default:
        s += format[p];
    }
    if (num !== false) {
      s += regexpGroup(digits + '{' + num + '}');
    }
  }

  return s;
}

/**
 * Create and set the regexp that matches timestamps in the local date format.
 *
 * This calls `getTimestampMainPartPattern()` with data for the current wiki.
 *
 * @private
 */
function setLocalTimestampRegexps() {
  const mainPartPattern = getTimestampMainPartPattern(
    cd.g.DATE_FORMAT,
    cd.g.DIGITS ? `[${cd.g.DIGITS}]` : '\\d'
  );
  const timezones = Object.keys(cd.g.messages)
    .filter((name) => name.startsWith('timezone-'))
    .map((name) => name.slice(9))
    .filter((name) => !['local', 'useoffset-placeholder'].includes(name));
  const localizedTimezones = TIMEZONES.concat(timezones).map((abbr) => {
    const message = mw.message('timezone-' + abbr);
    return message.exists() ? message.parse() : abbr;
  });
  const timezonePattern = (
    '\\((?:' +
    localizedTimezones.map(mw.util.escapeRegExp).join('|').toUpperCase() +
    ')\\)'
  );
  const pattern = mainPartPattern + ' ' + timezonePattern;

  /**
   * Regular expression for matching timestamps.
   *
   * @name TIMESTAMP_REGEXP
   * @type {RegExp}
   * @memberof module:cd~convenientDiscussions.g
   */
  cd.g.TIMESTAMP_REGEXP = new RegExp(pattern);

  /**
   * Regular expression for matching timestamps with no timezone at the end.
   *
   * @name TIMESTAMP_REGEXP_NO_TIMEZONE
   * @type {RegExp}
   * @memberof module:cd~convenientDiscussions.g
   */
  cd.g.TIMESTAMP_REGEXP_NO_TIMEZONE = new RegExp(mainPartPattern);

  /**
   * Regular expression for matching timezone, with a global flag.
   *
   * @name TIMEZONE_REGEXP
   * @type {RegExp}
   * @memberof module:cd~convenientDiscussions.g
   */
  cd.g.TIMEZONE_REGEXP = new RegExp(timezonePattern, 'g');
}

/**
 * Create and set the function that parses timestamps in the local date format, based on the result
 * of matching the regexp set by `setLocalTimestampRegexps()`.
 *
 * @private
 */
function setLocalTimestampParser() {
  const format = cd.g.DATE_FORMAT;

  const matchingGroups = [];
  for (let p = 0; p < format.length; p++) {
    let code = format[p];
    if (code === 'x' && p < format.length - 1) {
      code += format[++p];
    }
    if (code === 'xk' && p < format.length - 1) {
      code += format[++p];
    }

    switch (code) {
      case 'xx':
        break;
      case 'xg':
      case 'd':
      case 'j':
      case 'D':
      case 'l':
      case 'F':
      case 'M':
      case 'n':
      case 'Y':
      case 'xkY':
      case 'G':
      case 'H':
      case 'i':
        matchingGroups.push(code);
        break;
      case '\\':
        // Backslash escaping
        if (p < format.length - 1) {
          ++p;
        }
        break;
      case '"':
        // Quoted literal
        if (p < format.length - 1) {
          const endQuote = format.indexOf('"', p + 1)
          if (endQuote !== -1) {
            p = endQuote;
          }
        }
        break;
      default:
        break;
    }
  }

  // We can't use the variables from the scope of the current function and have to accept the global
  // object as a parameter because we need to use the function in a web worker which can receive
  // functions only as strings, forgetting their scope.

  /**
   * Timestamp parser.
   *
   * @name TIMESTAMP_PARSER
   * @param {Array} match Regexp match data.
   * @param {object} cd `convenientDiscussions` (in the window context) / `cd` (in the worker
   *   context) global object.
   * @param {number} [timezoneOffset] User's timezone, if it should be used instead of the wiki's
   *   timezone.
   * @returns {Date}
   * @memberof module:cd~convenientDiscussions.g
   */
  cd.g.TIMESTAMP_PARSER = (match, cd, timezoneOffset) => {
    const untransformDigits = (text) => {
      if (!cd.g.DIGITS) {
        return text;
      }
      return text.replace(new RegExp('[' + cd.g.DIGITS + ']', 'g'), (m) => cd.g.DIGITS.indexOf(m));
    };

    // Override the imported function to be able to use it in the worker context.
    const getMessages = (messages) => messages.map((name) => cd.g.messages[name]);

    let year = 0;
    let monthIdx = 0;
    let day = 0;
    let hour = 0;
    let minute = 0;

    for (let i = 0; i < cd.g.TIMESTAMP_MATCHING_GROUPS.length; i++) {
      const code = cd.g.TIMESTAMP_MATCHING_GROUPS[i];
      const text = match[i + 3];

      switch (code) {
        case 'xg':
          monthIdx = getMessages([
            'january-gen', 'february-gen', 'march-gen', 'april-gen', 'may-gen', 'june-gen',
            'july-gen', 'august-gen', 'september-gen', 'october-gen', 'november-gen', 'december-gen'
          ]).indexOf(text);
          break;
        case 'd':
        case 'j':
          day = Number(untransformDigits(text));
          break;
        case 'D':
        case 'l':
          // Day of the week - unused
          break;
        case 'F':
          monthIdx = getMessages([
            'january', 'february', 'march', 'april', 'may_long', 'june', 'july', 'august',
            'september', 'october', 'november', 'december'
          ]).indexOf(text);
          break;
        case 'M':
          monthIdx = getMessages([
            'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
          ]).indexOf(text);
          break;
        case 'n':
          monthIdx = Number(untransformDigits(text)) - 1;
          break;
        case 'Y':
          year = Number(untransformDigits(text));
          break;
        case 'xkY':
          // Thai year
          year = Number(untransformDigits(text)) - 543;
          break;
        case 'G':
        case 'H':
          hour = Number(untransformDigits(text));
          break;
        case 'i':
          minute = Number(untransformDigits(text));
          break;
        default:
          throw 'Not implemented';
      }
    }

    if (timezoneOffset === undefined) {
      timezoneOffset = cd.g.LOCAL_TIMEZONE_OFFSET;
    }

    return new Date(
      Date.UTC(year, monthIdx, day, hour, minute) -
      timezoneOffset * cd.g.MILLISECONDS_IN_A_MINUTE
    );
  };

  /**
   * Codes of date components for the parser function.
   *
   * @name TIMESTAMP_MATCHING_GROUPS
   * @type {string[]}
   * @memberof module:cd~convenientDiscussions.g
   */
  cd.g.TIMESTAMP_MATCHING_GROUPS = matchingGroups;
}

/**
 * Set the global variables related to timestamp parsing.
 */
export function initTimestampParsingTools() {
  setFormats();
  setLocalTimestampRegexps();
  setLocalTimestampParser();
}
