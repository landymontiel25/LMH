// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('./firebase', () => ({ auth: { currentUser: { uid: 'me' } } }));
vi.mock('./apiAuth', () => ({ authHeaders: async () => ({ Authorization: 'Bearer t' }) }));

import { useSmartSearch, useSmartCitySearch } from './smartSearch';

let container;
let latest;
function Probe(props) {
  latest = useSmartSearch(props);
  return null;
}
function CityProbe({ q, local }) {
  latest = useSmartCitySearch(q, local);
  return null;
}
let root;
async function render(el) {
  await act(async () => root.render(el));
}

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.removeChild(container);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const items = [
  { id: 'c1', text: 'Big Ben — London' },
  { id: 'c2', text: 'Eiffel Tower — Paris' },
];

describe('useSmartSearch', () => {
  it('asks the AI once the word search comes up short, after a pause', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ids: ['c1'] }) }));
    vi.stubGlobal('fetch', fetchMock);
    await render(<Probe query="the big clock in london" localCount={0} items={items} />);
    expect(latest.loading).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(700));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.query).toBe('the big clock in london');
    expect(body.items).toEqual(items);
    expect(latest).toEqual({ ids: ['c1'], loading: false });
  });

  it('stays quiet when the word search already found enough, or the query is too short', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await render(<Probe query="tower" localCount={5} items={items} />);
    await act(async () => vi.advanceTimersByTimeAsync(700));
    await render(<Probe query="bi" localCount={0} items={items} />);
    await act(async () => vi.advanceTimersByTimeAsync(700));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(latest).toEqual({ ids: [], loading: false });
  });

  it('only sends the last query when typing fast, and caches answers', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ids: ['c2'] }) }));
    vi.stubGlobal('fetch', fetchMock);
    await render(<Probe query="iron tow" localCount={0} items={items} />);
    await act(async () => vi.advanceTimersByTimeAsync(200));
    await render(<Probe query="iron tower paris" localCount={0} items={items} />);
    await act(async () => vi.advanceTimersByTimeAsync(700));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).query).toBe('iron tower paris');
    await render(<Probe query="something else" localCount={0} items={items} />);
    await render(<Probe query="iron tower paris" localCount={0} items={items} />);
    expect(latest.ids).toEqual(['c2']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the plain results when the AI call fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await render(<Probe query="nowhere special" localCount={0} items={items} />);
    await act(async () => vi.advanceTimersByTimeAsync(700));
    expect(latest).toEqual({ ids: [], loading: false });
  });
});

describe('useSmartCitySearch', () => {
  it('returns the cities the AI picked that the word search missed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ids: ['paris', 'nyc'] }) })));
    await render(<CityProbe q="city of the eiffel tower" local={[{ id: 'nyc' }]} />);
    await act(async () => vi.advanceTimersByTimeAsync(700));
    expect(latest.cities.map((c) => c.id)).toEqual(['paris']);
  });
});
