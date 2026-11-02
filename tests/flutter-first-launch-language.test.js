'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const dart = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');

test('first launch shows the language welcome before authentication and home', () => {
  assert.match(dart, /home:\s*const WelcomeLanguageGate\(/);
  assert.match(dart, /WelcomeLanguageGate\(\s*child:\s*GlobalPhoneAuthGate\(child:\s*PgntHomePage\(\)\)/);
  assert.match(dart, /class WelcomeLanguageGate extends StatefulWidget/);
});

test('welcome screen exposes all six supported languages by native name', () => {
  for (const code of ['ps', 'fa', 'en', 'ur', 'hi', 'bn']) {
    assert.match(dart, new RegExp("AppLanguage\\('" + code + "'"));
  }
  for (const nativeName of ['پښتو', 'دری', 'English', 'اردو', 'हिन्दी', 'বাংলা']) {
    assert.ok(dart.includes(nativeName), 'missing language label: ' + nativeName);
  }
});

test('selected language is saved and restored across app launches', () => {
  assert.match(dart, /_languagePreferenceKey\s*=\s*'pgnt_selected_language_v1'/);
  assert.match(dart, /preferences\.setString\(\s*_languagePreferenceKey/);
  assert.match(dart, /preferences\.getString\(_languagePreferenceKey\)/);
});
