export interface Compliance {
  done: number;
  expected: number;
  percent: number | null;
}

export function compliance(done: number, expected: number): Compliance {
  return {
    done,
    expected,
    percent: expected ? Math.round(Math.min(1, done / expected) * 100) : null,
  };
}
