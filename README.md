# eepy.page-i18n-helper

A VSCode extension for managing localization across the eepy.page frontend and backend

Makes the management process much easier for developers, because nobody likes managing i18n! &colon;&rpar;

---

## Features

- **Editing keys via "Rename Symbol"**: Press `F2` with your cursor on any `t()` call to edit the JSON file of your selected language directly, without leaving your code or looking at a single JSON file.
- **Hover Inspection**: Hover over any `t()` call to see more information.
- **Language Switcher**: Switch the active language in the bottom right corner of your editor (looks something like `i18n: en`). Changes the locale that edits apply to and previews read from.
- **Missing Alerts**: Missing strings show a `[missing]` badge next to the `t()` call, so you can catch missing strings before committing your code. Additionally, missing keys will show up as errors in the VSCode "Problems" tab, and untranslated keys in other locales will show up as warnings.

---

## Settings

| Setting                         | Default Value  | Description                                                   |
| :------------------------------ | :------------- | :------------------------------------------------------------ |
| `eepyI18n.dimCalls`             | `true`         | Enables/disables dimming `t(...)` calls to avoid distraction. |
| `eepyI18n.callColor`            | `"#6e7681"`    | Hex color for dimmed `t(...)` calls                           |
| `eepyI18n.hintStyle`            | `"decoration"` | Render style: `"decoration"`, `"native"`, or `"none"`         |
| `eepyI18n.hintColor`            | `"#d4d4d4"`    | Hex color for inline translation hints                        |
| `eepyI18n.missingColor`         | `"#F14C4C"`    | Hex color for missing translation badges and errors           |
| `eepyI18n.warningColor`         | `"#CCA700"`    | Hex color for untranslated warning hints                      |
| `eepyI18n.displayLanguage`      | `"en"`         | Active language                                               |
| `eepyI18n.inlayHints.maxLength` | `45`           | Maximum preview length before truncation                      |
| `eepyI18n.localesPath`          | `""`           | Custom path to your locales directory                         |

## Disclaimer
AI was used to assist in the creation of this extension. All code has been thoroughly reviewed and tested, but it's better to be transparent than not.
