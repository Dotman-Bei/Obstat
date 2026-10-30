import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalFaculty, fold, nameKey, transliterate } from '../src/data/normalize.ts';

test('reversed name order meets on one key', () => {
  assert.equal(nameKey('Jeremić Mirjana'), nameKey('Mirjana Jeremić'));
  assert.equal(nameKey('Mirjana Jeremić'), 'jeremic mirjana');
});

test('Serbian Cyrillic transliterates to Latin', () => {
  assert.equal(transliterate('Јелена Марковић'), 'jelena marković');
  assert.equal(transliterate('Љиљана Њего Џаковић'), 'ljiljana njego džaković');
  assert.equal(nameKey('Наталија Мирковић'), nameKey('Natalija Mirković'));
});

test('diacritics fold to ASCII, with đ as dj', () => {
  assert.equal(fold('Đurđica Šarić-Žigić'), 'djurdjica saric zigic');
  assert.equal(fold('Грађевински факултет'), 'gradjevinski fakultet');
  assert.equal(fold('Katarína Lačoková'), 'katarina lacokova');
});

test('faculties written in Serbian map to their English names', () => {
  assert.equal(canonicalFaculty('Fakultet tehničkih nauka'), 'Faculty of Technical Sciences');
  assert.equal(canonicalFaculty('Факултет техничких наука'), 'Faculty of Technical Sciences');
  assert.equal(canonicalFaculty('Технички факултет „Михајло Пупин“ Зрењанин'), 'Technical Faculty "Mihajlo Pupin" Zrenjanin');
  assert.equal(canonicalFaculty('Институт БиоСенс'), 'BioSense Institute');
  assert.equal(canonicalFaculty('Faculty of Law'), 'Faculty of Law');
});
