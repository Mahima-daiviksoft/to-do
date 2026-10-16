// Chapter 11 — inline snapshots and property matchers
const createUser = (name) => ({ id: Math.random().toString(36).slice(2), name, createdAt: new Date() });

test('inline snapshot', () => {
  expect({ city: 'Paris', zip: '75001' }).toMatchInlineSnapshot(`
{
  "city": "Paris",
  "zip": "75001",
}
`);
});

test('property matchers for dynamic fields', () => {
  expect(createUser('Ann')).toMatchInlineSnapshot(
    { id: expect.any(String), createdAt: expect.any(Date) },
    `
{
  "createdAt": Any<Date>,
  "id": Any<String>,
  "name": "Ann",
}
`,
  );
});
