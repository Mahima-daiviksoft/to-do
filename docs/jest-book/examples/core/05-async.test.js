// Chapter 5 — async patterns
const fetchUser = (id) =>
  new Promise((resolve, reject) =>
    setTimeout(() => (id > 0 ? resolve({ id, name: 'Ann' }) : reject(new Error('not found'))), 5),
  );

test('async/await', async () => {
  const user = await fetchUser(1);
  expect(user.name).toBe('Ann');
});

test('resolves / rejects (awaited!)', async () => {
  await expect(fetchUser(1)).resolves.toMatchObject({ name: 'Ann' });
  await expect(fetchUser(-1)).rejects.toThrow('not found');
});

test('expect.assertions protects try/catch tests', async () => {
  expect.assertions(1);
  try {
    await fetchUser(-1);
  } catch (e) {
    expect(e.message).toBe('not found');
  }
});

test('done callback with try/catch', (done) => {
  setTimeout(() => {
    try {
      expect(1 + 1).toBe(2);
      done();
    } catch (err) {
      done(err);
    }
  }, 5);
});
