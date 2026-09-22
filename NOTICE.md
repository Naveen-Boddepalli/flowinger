# Third-party notices

Flowinger is written independently and is MIT licensed (see [LICENSE.md](LICENSE.md)). One part of it is
adapted from another MIT-licensed project rather than developed from scratch, and is credited here.

## React Flow

[`src/paths.ts`](src/paths.ts)'s `calculateControlPointOffset`, `getControlPoints`, `getEdgeCenter` and
`getBezierEdgeCenter` — the bezier control-point offset formula (how far a control point sits out from its
node, and that a low or negative distance curves it rather than pulling it flat), and where a bezier's label
sits on the curve itself rather than the straight line between its ends — are adapted from React Flow's
`calculateControlOffset`, `getControlWithCurvature`, `getEdgeCenter` and `getBezierEdgeCenter`.

- Project: [React Flow](https://reactflow.dev) ([github.com/xyflow/xyflow](https://github.com/xyflow/xyflow)),
  packages `@xyflow/react` and `@xyflow/system`.
- License: MIT.

```
MIT License

Copyright (c) 2019-2025 webkid GmbH

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Nothing else in flowinger is derived from React Flow's source — the rest of the API shape (prop names, class
names, component signatures) was built to match its *behaviour*, which is not itself copyrightable, not by
reading its code.
