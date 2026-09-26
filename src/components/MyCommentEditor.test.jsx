// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const saveMyComment = vi.fn(async ({ comment }) => comment.trim());
vi.mock('../lib/reviews', () => ({ saveMyComment: (...a) => saveMyComment(...a) }));

import MyCommentEditor from './MyCommentEditor';

let container;
afterEach(() => {
  document.body.removeChild(container);
  saveMyComment.mockClear();
});

async function mount(el) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(el));
}

const click = (text) =>
  act(async () => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(text)).click());

async function type(value) {
  const ta = container.querySelector('textarea');
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  await act(async () => {
    setter.call(ta, value);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const landmark = { id: 'lm1', name: 'Shooting Range', region: 'philly' };

describe('MyCommentEditor', () => {
  it('adds a comment to a check-in that had none', async () => {
    await mount(<MyCommentEditor userId="me" landmark={landmark} comment="" />);
    await click('Add a comment');
    await type('Great instructors');
    await click('Save');
    expect(saveMyComment).toHaveBeenCalledWith({ userId: 'me', landmark, comment: 'Great instructors' });
    expect(container.textContent).toContain('Great instructors');
    expect(container.textContent).toContain('Edit comment');
  });

  it('edits an existing comment, starting from what was there', async () => {
    const onSaved = vi.fn();
    await mount(<MyCommentEditor userId="me" landmark={landmark} comment="Fun" onSaved={onSaved} />);
    await click('Edit comment');
    expect(container.querySelector('textarea').value).toBe('Fun');
    await type('Fun. Bring ear protection.');
    await click('Save');
    expect(onSaved).toHaveBeenCalledWith('Fun. Bring ear protection.');
    expect(container.textContent).toContain('Bring ear protection');
  });

  it('keeps the text and shows an error when saving fails', async () => {
    saveMyComment.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'permission-denied' }));
    await mount(<MyCommentEditor userId="me" landmark={landmark} comment="" />);
    await click('Add a comment');
    await type('Draft text');
    await click('Save');
    expect(container.querySelector('textarea').value).toBe('Draft text');
    expect(container.querySelector('.tag-error')).not.toBeNull();
  });
});
