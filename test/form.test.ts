import { describe, it, expect, vi } from 'vitest';
import { GoogleFormHandler, FORM_FIELDS } from '../src/form.js';

describe('GoogleFormHandler', () => {
  const formUrl = 'https://docs.google.com/forms/test';
  const handler = new GoogleFormHandler(formUrl);

  it('should return hardcoded fields', async () => {
    const fields = await handler.fetchForm();

    expect(fields).toHaveLength(4);
    expect(fields).toEqual(FORM_FIELDS);

    expect(fields[0].label).toBe('Name');
    expect(fields[0].id).toBe('entry.2005620554');
    expect(fields[1].label).toBe('Email');
    expect(fields[1].id).toBe('entry.1045781291');
  });
});
