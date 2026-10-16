# Chapter 4 — Matchers: The Complete Reference

> 🧸 **Explain it like I'm 5**
>
> `expect(something)` is you pointing at a thing and saying "look at this!".
> The **matcher** is what you say next: "…is exactly this", "…looks the same as this",
> "…has 3 things in it", "…is bigger than 10".
> If what you said is true, the test is happy. If not, Jest shouts and shows you the difference.

---

## 4.1 How `expect` works

```js
expect(received).matcher(expected);
```

- `received` — the value your code produced.
- `matcher` — the kind of check.
- `expected` — what it should be.

`expect(x)` returns an object full of matcher methods. When a matcher fails it **throws** a special
error (`JestAssertionError`) containing a nice message. Throwing is what makes the test fail. This
is why:

- the **first failing assertion stops the test** (later lines don't run), and
- wrapping assertions in `try/catch` can **hide failures** (⚠️ never do `try { expect(...) } catch {}`).

## 4.2 Equality matchers — the most important section

### `toBe(value)` — "is it the very same thing?"

Uses **`Object.is`** — the same as `===` except:

| Expression | `===` | `Object.is` / `toBe` |
| --- | --- | --- |
| `NaN` vs `NaN` | `false` | `true` ✅ |
| `+0` vs `-0` | `true` | `false` ❗ |

```js
expect(2 + 2).toBe(4);           // ✅ primitives
expect('hi').toBe('hi');         // ✅
expect(NaN).toBe(NaN);           // ✅ (Object.is)

expect({ a: 1 }).toBe({ a: 1 }); // ❌ two different objects in memory
const obj = { a: 1 };
expect(obj).toBe(obj);           // ✅ same reference
```

Use `toBe` for **primitives** (numbers, strings, booleans, null, undefined, symbols, bigint) and to
check **object identity** ("is it the same instance?", e.g. a cache returning the same object).

If you use `toBe` on two equal-looking objects, the failure message helpfully says:

```
expect(received).toBe(expected) // Object.is equality

If it should pass with deep equality, replace "toBe" with "toStrictEqual"

Expected: {"a": 1}
Received: serializes to the same string
```

🎯 "**Received: serializes to the same string**" means *the values print identically but are
different*: usually different object references (`toBe`), or differences that printing hides
(a class instance vs a plain object, a non-enumerable property, functions with the same source).
Switch to `toEqual`/`toStrictEqual`, or look for the hidden difference.

### `toEqual(value)` — "does it look the same?" (deep, loose)

Recursively compares all **own enumerable properties**. Primitives compared with `Object.is`.

```js
expect({ a: 1, b: [1, 2] }).toEqual({ a: 1, b: [1, 2] }); // ✅
expect(new Map([[1, 'x']])).toEqual(new Map([[1, 'x']])); // ✅ Maps compared by entries
expect(new Set([1, 2])).toEqual(new Set([2, 1]));         // ✅ Set order doesn't matter
expect(new Date(1)).toEqual(new Date(1));                 // ✅ compared by time
expect(/a/g).toEqual(/a/g);                               // ✅ compared by source+flags
expect(Buffer.from('a')).toEqual(Buffer.from('a'));       // ✅ typed arrays/buffers by content
```

What `toEqual` **ignores** (this is the famous list — 🎯 interview favourite):

1. Properties whose value is `undefined`: `{ a: undefined, b: 2 }` equals `{ b: 2 }`.
2. `undefined` array items: `[2]` equals `[2, undefined]`.
3. Array sparseness: `[, 1]` equals `[undefined, 1]`.
4. Object type (class): `new Cat()` with `{name: 'Tom'}` equals plain `{ name: 'Tom' }`.
5. Non-enumerable properties (📌 since Jest 30 this is also excluded by default).
6. Getters defined on the prototype (class `get x()`), because they are not own properties.

And for **`Error` objects**: only the **`message`** is compared — `new TypeError('x')` *equals*
`new Error('x')`, and extra properties like `code` or `cause` are ignored by `toEqual`
(verified on Jest 30.5). Use `toThrow` / `toMatchObject` / explicit property checks for errors.

Functions are compared by reference: `expect(() => {}).toEqual(() => {})` ❌ fails.

### `toStrictEqual(value)` — "same look AND same type"

Like `toEqual` but **does** check items 1–4 above:

```js
expect({ a: undefined, b: 2 }).toEqual({ b: 2 });         // ✅
expect({ a: undefined, b: 2 }).toStrictEqual({ b: 2 });   // ❌

class Cat { constructor(n) { this.name = n; } }
expect(new Cat('Tom')).toEqual({ name: 'Tom' });          // ✅
expect(new Cat('Tom')).toStrictEqual({ name: 'Tom' });    // ❌ different prototype

expect([, 1]).toStrictEqual([undefined, 1]);              // ❌ sparseness
```

✅ **Best practice:** prefer `toStrictEqual` for data returned by your code (API payloads, reducers).
It catches accidental `undefined` keys that would show up in JSON as missing fields, and class vs
plain-object mix-ups.

### Decision table

| You want to check… | Use |
| --- | --- |
| a primitive value | `toBe` |
| same object instance | `toBe` |
| object/array content, loosely | `toEqual` |
| object/array content + types + undefined keys | `toStrictEqual` |
| only *some* properties of an object | `toMatchObject` or `expect.objectContaining` |
| a float result | `toBeCloseTo` |

## 4.3 Truthiness matchers

| Matcher | Passes when value is… |
| --- | --- |
| `toBeNull()` | exactly `null` |
| `toBeUndefined()` | exactly `undefined` |
| `toBeDefined()` | anything except `undefined` (note: `null` **is defined**) |
| `toBeTruthy()` | truthy (`if (x)` would run) — `[]`, `{}`, `'0'` are truthy! |
| `toBeFalsy()` | `false`, `0`, `-0`, `0n`, `''`, `null`, `undefined`, `NaN` |
| `toBeNaN()` | `NaN` |

```js
expect(null).toBeDefined();   // ✅ (surprises people)
expect([]).toBeTruthy();      // ✅ empty array is truthy
```

⚠️ `toBeTruthy`/`toBeFalsy` are vague. `expect(user.isAdmin).toBe(true)` is a stronger test than
`toBeTruthy()` (which also passes for `'yes'`, `1`, `{}`).

## 4.4 Number matchers

```js
expect(10).toBeGreaterThan(5);
expect(10).toBeGreaterThanOrEqual(10);
expect(3).toBeLessThan(5);
expect(3).toBeLessThanOrEqual(3);
expect(10n).toBeGreaterThan(5n);        // bigint supported
```

### Floating point: `toBeCloseTo(number, numDigits = 2)`

```js
expect(0.1 + 0.2).toBe(0.3);        // ❌ 0.30000000000000004
expect(0.1 + 0.2).toBeCloseTo(0.3); // ✅
```

🔍 Rule: passes when `|expected − received| < 10^(−numDigits) / 2`. With the default 2 digits that
means the difference must be **less than 0.005**:

```js
expect(0.3).toBeCloseTo(0.304); // ✅ diff 0.004
expect(0.3).toBeCloseTo(0.306); // ❌ diff 0.006
expect(0.3).toBeCloseTo(0.306, 1); // ✅ precision 0.05
```

💼 For money, don't use floats at all in code — use integer cents or a decimal library — then
`toBe` works.

## 4.5 String matchers

```js
expect('Hello World').toMatch(/world/i);  // regex
expect('Hello World').toMatch('lo W');    // string → "contains" check
expect('hello').toContain('ell');         // also works on strings
expect('abc').toHaveLength(3);
```

## 4.6 Arrays & iterables

```js
const fruits = ['apple', 'banana'];

expect(fruits).toContain('apple');                   // uses === (strict)
expect(new Set(['a'])).toContain('a');               // any iterable
expect(fruits).toHaveLength(2);

const users = [{ id: 1 }, { id: 2 }];
expect(users).toContain({ id: 1 });                  // ❌ different object!
expect(users).toContainEqual({ id: 1 });             // ✅ deep equality
```

`toContain` = "is this exact item (`===`) in there?"; `toContainEqual` = "is an item that
`toEqual`s this in there?".

## 4.7 Objects: `toHaveProperty` and `toMatchObject`

### `toHaveProperty(keyPath, value?)`

```js
const user = {
  name: 'Ann',
  address: { city: 'Paris', zips: ['75001', '75002'] },
  'weird.key': true,
};

expect(user).toHaveProperty('name');
expect(user).toHaveProperty('name', 'Ann');                 // value compared with toEqual-like equality
expect(user).toHaveProperty('address.city', 'Paris');       // dot path
expect(user).toHaveProperty('address.zips[1]', '75002');    // index in path
expect(user).toHaveProperty(['address', 'zips', 0], '75001'); // array path
expect(user).toHaveProperty(['weird.key']);                 // key containing a dot
```

Note: a property that exists with value `undefined` still counts as present:
`expect({ a: undefined }).toHaveProperty('a')` ✅.

### `toMatchObject(object | array)` — "contains at least these"

```js
const response = { id: 7, name: 'Ann', createdAt: '2024-01-01', meta: { v: 1, debug: true } };

expect(response).toMatchObject({ name: 'Ann', meta: { v: 1 } }); // ✅ recursive subset
```

- Extra properties on the received object are fine, **at every nesting level**.
- With arrays, the arrays must have the **same length**; each element is matched as a subset:

```js
expect([{ a: 1, b: 2 }]).toMatchObject([{ a: 1 }]);            // ✅
expect([{ a: 1 }, { a: 2 }]).toMatchObject([{ a: 1 }]);        // ❌ length differs
```

## 4.8 Errors: `toThrow(error?)`

```js
function withdraw(amount) {
  if (amount < 0) throw new RangeError('Amount must be positive');
}

expect(() => withdraw(-1)).toThrow();                         // throws something
expect(() => withdraw(-1)).toThrow(RangeError);               // instance of class
expect(() => withdraw(-1)).toThrow('must be positive');       // message CONTAINS substring
expect(() => withdraw(-1)).toThrow(/^Amount/);                // message matches regex
expect(() => withdraw(-1)).toThrow(new Error('Amount must be positive')); // message EQUALS
expect(() => withdraw(5)).not.toThrow();
```

⚠️ **The #1 `toThrow` bug:** passing the *result* instead of a *function*:

```js
expect(withdraw(-1)).toThrow();   // ❌ withdraw runs BEFORE expect; the error escapes and fails the test
expect(() => withdraw(-1)).toThrow(); // ✅
```

Check type **and** message: chain two assertions, or use `toMatchObject` on the caught error:

```js
expect(() => withdraw(-1)).toThrow(RangeError);
expect(() => withdraw(-1)).toThrow('positive');
```

Checking extra properties (e.g. an HTTP error code):

```js
let error;
try { withdraw(-1); } catch (e) { error = e; }
expect(error).toBeInstanceOf(RangeError);
expect(error).toMatchObject({ message: expect.stringContaining('positive') });
```

(If you do this, make sure the test fails when nothing is thrown — `expect(error).toBeInstanceOf`
does that because `undefined` is not an instance.)

For async functions see Chapter 5: `await expect(promise).rejects.toThrow(...)`.

📌 `toThrowError` was an alias of `toThrow` — **removed in Jest 30**.

## 4.9 Types and instances

```js
expect(new Date()).toBeInstanceOf(Date);
expect([]).toBeInstanceOf(Array);
expect([]).toBeInstanceOf(Object);       // ✅ arrays are objects too
expect(typeof fn).toBe('function');
```

⚠️ `toBeInstanceOf` can fail across **realms**: an `Array` created inside the jsdom/vm sandbox vs one
from Node's main context (e.g. returned by some native module) are different constructors. If you see
"Expected constructor: Array, Received constructor: Array", that's a realm mismatch — compare with
`Array.isArray(x)` instead.

## 4.10 Mock-function matchers (preview)

Covered fully in Chapter 7:

| Matcher | Checks |
| --- | --- |
| `toHaveBeenCalled()` | called at least once |
| `toHaveBeenCalledTimes(n)` | called exactly n times |
| `toHaveBeenCalledWith(...args)` | **some** call had these args |
| `toHaveBeenLastCalledWith(...args)` | the last call had these args |
| `toHaveBeenNthCalledWith(n, ...args)` | the nth call (1-based) had these args |
| `toHaveReturned()` | returned (didn't throw) at least once |
| `toHaveReturnedTimes(n)` | returned successfully n times |
| `toHaveReturnedWith(value)` | some call returned `value` |
| `toHaveLastReturnedWith(value)` | last call returned `value` |
| `toHaveNthReturnedWith(n, value)` | nth call returned `value` |

📌 **Removed in Jest 30** (aliases): `toBeCalled`, `toBeCalledTimes`, `toBeCalledWith`,
`lastCalledWith`, `nthCalledWith`, `toReturn`, `toReturnTimes`, `toReturnWith`, `lastReturnedWith`,
`nthReturnedWith`, `toThrowError`. In Jest 30 calling them gives `TypeError: expect(...).toBeCalled is not a function`.

## 4.11 Snapshot matchers (preview — Chapter 11)

- `toMatchSnapshot(propertyMatchers?, hint?)`
- `toMatchInlineSnapshot(propertyMatchers?, inlineSnapshot?)`
- `toThrowErrorMatchingSnapshot(hint?)`
- `toThrowErrorMatchingInlineSnapshot(inlineSnapshot?)`

## 4.12 Modifiers: `.not`, `.resolves`, `.rejects`

```js
expect(2).not.toBe(3);
await expect(fetchUser(1)).resolves.toEqual({ id: 1 });
await expect(fetchUser(-1)).rejects.toThrow('not found');
```

`.resolves`/`.rejects` **must be awaited or returned** (Chapter 5).

## 4.13 Asymmetric matchers — "any value like this"

Asymmetric matchers are placeholders you put **inside** an expected value. They're asymmetric
because `expect(a).toEqual(matcher)` works, but the matcher isn't a real value.

| Matcher | Matches |
| --- | --- |
| `expect.anything()` | anything **except `null` and `undefined`** |
| `expect.any(Constructor)` | anything created by that constructor, or primitive of that type (`expect.any(Number)` matches `5` — and also `NaN`) |
| `expect.objectContaining(obj)` | an object having at least these props (each compared with **equality**, not recursively "containing") |
| `expect.arrayContaining(arr)` | an array containing all these items (any order, extra items ok; empty expected matches any array) |
| `expect.arrayOf(matcher)` | an array where **every** element matches (empty array matches) — 📌 Jest 30 |
| `expect.stringContaining(str)` | a string containing `str` |
| `expect.stringMatching(str \| regex)` | a string matching the regex |
| `expect.closeTo(num, digits?)` | a number close to `num` (like `toBeCloseTo` inside objects) |
| `expect.not.objectContaining(obj)` | object NOT containing those |
| `expect.not.arrayContaining(arr)` | array NOT containing all of those |
| `expect.not.arrayOf(m)` | array where NOT every element matches |
| `expect.not.stringContaining(s)` / `expect.not.stringMatching(r)` | inverses |

Real-life example — an API response with generated fields:

```js
expect(createdUser).toEqual({
  id: expect.any(String),
  email: 'ann@example.com',
  roles: expect.arrayContaining(['user']),
  createdAt: expect.any(Date),
  profile: expect.objectContaining({ displayName: 'Ann' }),
  score: expect.closeTo(0.3, 5),
  tags: expect.arrayOf(expect.any(String)),
});
```

With mocks:

```js
expect(logger.info).toHaveBeenCalledWith(
  expect.stringContaining('user created'),
  expect.objectContaining({ userId: expect.any(String) }),
);
```

⚠️ `objectContaining` is **not deep-partial**: nested objects must be fully equal unless you nest
another `objectContaining`:

```js
expect({ a: { b: 1, c: 2 } }).toEqual(expect.objectContaining({ a: { b: 1 } }));        // ❌
expect({ a: { b: 1, c: 2 } }).toEqual(expect.objectContaining({ a: expect.objectContaining({ b: 1 }) })); // ✅
expect({ a: { b: 1, c: 2 } }).toMatchObject({ a: { b: 1 } });                            // ✅ toMatchObject IS recursive
```

⚠️ `expect.anything()` does **not** match `null`/`undefined`. Use `expect.any(Object)`? — no, that
won't match them either. To allow "anything including undefined", omit the key and use
`objectContaining`, or write a custom asymmetric matcher.

## 4.14 Assertion counting

```js
test('callback is called twice', () => {
  expect.assertions(2);        // exactly 2 assertions must run in this test
  processItems([1, 2], (item) => {
    expect(item).toBeGreaterThan(0);
  });
});

test('at least one assertion', async () => {
  expect.hasAssertions();      // at least 1
  // ...
});
```

Useful when assertions live inside callbacks or `catch` blocks that might never run (Chapter 5).

## 4.15 `expect` utilities (advanced, details in Chapter 20)

- `expect.extend({ ... })` — add your own matchers (e.g. `toBeWithinRange`).
- `expect.addEqualityTesters([fn])` — teach `toEqual` how to compare your custom types
  (e.g. `Money`, `Decimal`, `Temporal` objects).
- `expect.addSnapshotSerializer(serializer)` — custom snapshot printing.
- `expect.getState()` / `expect.setState()` — matcher state (current test name, assertion counts…).
- Static `SERIALIZABLE_PROPERTIES` on a class (📌 Jest 30) — choose which properties appear in
  diffs/snapshots.

## 4.16 Popular extra matcher libraries

| Library | Adds | Example |
| --- | --- | --- |
| `@testing-library/jest-dom` | DOM matchers | `toBeInTheDocument()`, `toHaveTextContent()`, `toBeDisabled()`, `toHaveAttribute()`, `toBeVisible()`, `toHaveValue()`, `toHaveClass()` |
| `jest-extended` | many general matchers | `toBeArray()`, `toBeOneOf([...])`, `toHaveBeenCalledBefore(mock)`, `toSatisfy(fn)`, `toBeEmpty()` |
| `jest-axe` | accessibility | `toHaveNoViolations()` |
| `@testing-library/react-native` (v12.4+) | RN matchers | `toBeOnTheScreen()`, `toHaveTextContent()` |

Set them up in `setupFilesAfterEnv` (Chapter 12):

```js
// jest.setup.js
import '@testing-library/jest-dom';
```

## 4.17 Reading failure diffs

```
expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 1

  Object {
-   "total": 90,
+   "total": 100,
  }
```

- Lines with `-` (green) = expected; `+` (red) = received.
- Use `--expand` to see the full diff instead of a collapsed one.
- Use `--no-colors`/`--colors` in CI logs as needed.

## 4.18 Summary

- `toBe` (Object.is) for primitives/identity; `toEqual` for deep loose; `toStrictEqual` for deep
  strict.
- `toEqual` ignores undefined props, sparseness, class type; errors compare by message only.
- Use `toBeCloseTo` for floats, `toContainEqual` for objects in arrays, `toMatchObject` for subsets.
- Always wrap code in a function for `toThrow`.
- Asymmetric matchers (`expect.any`, `objectContaining`, `arrayContaining`, `stringMatching`,
  `arrayOf`, `closeTo`) let you match flexible data.

**Next:** [Chapter 5 — Testing asynchronous code](05-async-testing.md)
