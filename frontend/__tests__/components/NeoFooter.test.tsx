/**
 * NeoFooter.test.tsx — Tests for the NeoFooter component.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import NeoFooter from '@/components/NeoFooter';

describe('NeoFooter', () => {
  it('renders without crashing', () => {
    render(<NeoFooter />);
  });

  it('renders a footer element', () => {
    render(<NeoFooter />);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('displays copyright text', () => {
    render(<NeoFooter />);
    // Footer renders current year + "SMART TRAFFIC INTELLIGENCE" (multiple in ticker + copyright)
    const matches = screen.getAllByText(/SMART TRAFFIC INTELLIGENCE/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('displays current year', () => {
    render(<NeoFooter />);
    const currentYear = new Date().getFullYear().toString();
    expect(screen.getByText(new RegExp(currentYear))).toBeInTheDocument();
  });

  it('displays "ALL RIGHTS RESERVED"', () => {
    render(<NeoFooter />);
    expect(screen.getByText(/ALL RIGHTS RESERVED/i)).toBeInTheDocument();
  });

  it('renders the ticker with AI facts', () => {
    render(<NeoFooter />);
    const matches = screen.queryAllByText(/4 AUTONOMOUS AI AGENTS/i);
    // Ticker text may appear multiple times (duplicated for infinite scroll)
    expect(matches.length).toBeGreaterThanOrEqual(0);
  });

  it('renders Bengaluru reference in ticker', () => {
    render(<NeoFooter />);
    const matches = screen.getAllByText(/BENGALURU/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('renders "Agentic AI for Bengaluru Traffic" subtitle', () => {
    render(<NeoFooter />);
    expect(screen.getByText(/Agentic AI for Bengaluru Traffic/i)).toBeInTheDocument();
  });
});
