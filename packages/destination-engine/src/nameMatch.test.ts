import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchDestinationNames } from './nameMatch';

const catalogue = [
    { id: 'seville', name: 'Seville (Sevilla)' },
    { id: 'madrid', name: 'Madrid Barajas' },
    { id: 'madrid-centro', name: 'Madrid' },
    { id: 'tenerife', name: 'Tenerife South' },
];

test('an exact catalogue name matches its entry', () => {
    assert.deepEqual(matchDestinationNames(['Seville'], catalogue), [
        { id: 'seville', name: 'Seville (Sevilla)' },
    ]);
});

test('matching ignores case and accents', () => {
    assert.deepEqual(matchDestinationNames(['SEVILLA'], catalogue), [
        { id: 'seville', name: 'Seville (Sevilla)' },
    ]);
});

test('a longer phrase resolves to the longest catalogue name it contains', () => {
    assert.deepEqual(matchDestinationNames(['Madrid Barajas airport'], catalogue), [
        { id: 'madrid', name: 'Madrid Barajas' },
    ]);
});

test('an exact name wins over a longer name that merely contains it', () => {
    assert.deepEqual(matchDestinationNames(['Madrid'], catalogue), [
        { id: 'madrid-centro', name: 'Madrid' },
    ]);
});

test('names outside the catalogue are dropped, never invented', () => {
    assert.deepEqual(matchDestinationNames(['Atlantis'], catalogue), []);
});
