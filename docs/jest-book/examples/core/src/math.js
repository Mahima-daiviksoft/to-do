export const add = (a, b) => a + b;
export const double = (x) => add(x, x); // internal call: a spy on `add` will NOT see this (Ch 9 §9.3)
