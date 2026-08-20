// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';
import React from 'react';

// Mock fetch
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ success: true, output: "Mock executed output" }),
  })
);

describe('App', () => {
  it('renders Neo-Brutalist dashboard title', () => {
    render(<App />);
    expect(screen.getByText(/Soloknuckle Control Hub/i)).toBeDefined();
  });

  it('triggers sandbox execution and shows executing state', async () => {
    render(<App />);
    const executeBtn = await screen.findByText('Execute in Sandbox');
    fireEvent.click(executeBtn);
    expect(screen.getAllByText(/Executing.../i).length).toBeGreaterThan(0);
  });
});
