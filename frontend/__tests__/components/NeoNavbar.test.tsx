/**
 * NeoNavbar.test.tsx — Tests for the NeoNavbar navigation component.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import NeoNavbar from '@/components/NeoNavbar';

// Mock next/link
jest.mock('next/link', () => {
  return function MockLink({ href, children, ...props }: any) {
    return <a href={href} {...props}>{children}</a>;
  };
});

// Mock phosphor icons
jest.mock('@phosphor-icons/react', () => ({
  List: ({ ...props }: any) => <svg data-testid="menu-icon" {...props} />,
  X: ({ ...props }: any) => <svg data-testid="close-icon" {...props} />,
}));

describe('NeoNavbar', () => {
  it('renders without crashing', () => {
    render(<NeoNavbar />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('renders the nav element', () => {
    render(<NeoNavbar />);
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
  });

  it('renders navigation links for Desktop', () => {
    render(<NeoNavbar />);
    // These links exist in the desktop section (may be hidden by CSS)
    expect(screen.getAllByText(/Architecture/i).length).toBeGreaterThan(0);
  });

  it('renders Dashboard link', () => {
    render(<NeoNavbar />);
    expect(screen.getAllByText(/Dashboard/i).length).toBeGreaterThan(0);
  });

  it('renders Agents link', () => {
    render(<NeoNavbar />);
    expect(screen.getAllByText(/Agents/i).length).toBeGreaterThan(0);
  });

  it('renders Pipeline link', () => {
    render(<NeoNavbar />);
    expect(screen.getAllByText(/Pipeline/i).length).toBeGreaterThan(0);
  });

  it('renders Team link', () => {
    render(<NeoNavbar />);
    expect(screen.getAllByText(/Team/i).length).toBeGreaterThan(0);
  });

  it('renders STI brand logo', () => {
    render(<NeoNavbar />);
    expect(screen.getByText('STI')).toBeInTheDocument();
  });

  it('has a hamburger toggle button', () => {
    render(<NeoNavbar />);
    const menuButton = screen.getByRole('button', { name: /toggle menu/i });
    expect(menuButton).toBeInTheDocument();
  });

  it('shows menu items after hamburger click', () => {
    render(<NeoNavbar />);
    const menuButton = screen.getByRole('button', { name: /toggle menu/i });
    fireEvent.click(menuButton);
    // After click, mobile menu should show "Home" link
    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('toggles menu closed after second click', () => {
    render(<NeoNavbar />);
    const menuButton = screen.getByRole('button', { name: /toggle menu/i });
    fireEvent.click(menuButton); // open
    fireEvent.click(menuButton); // close
    expect(screen.queryByText('Home')).not.toBeInTheDocument();
  });

  it('dashboard link has correct href', () => {
    render(<NeoNavbar />);
    const links = screen.getAllByRole('link', { name: /Dashboard/i });
    expect(links.some(link => link.getAttribute('href') === '/dashboard')).toBe(true);
  });

  it('architecture link has correct href', () => {
    render(<NeoNavbar />);
    const links = screen.getAllByRole('link', { name: /Architecture/i });
    expect(links.some(link => link.getAttribute('href') === '/architecture')).toBe(true);
  });

  it('agents link has correct href', () => {
    render(<NeoNavbar />);
    const links = screen.getAllByRole('link', { name: /Agents/i });
    expect(links.some(link => link.getAttribute('href') === '/agents')).toBe(true);
  });

  it('closes mobile menu when a mobile link is clicked', () => {
    render(<NeoNavbar />);
    const menuButton = screen.getByRole('button', { name: /toggle menu/i });
    fireEvent.click(menuButton); // open mobile menu

    // Click a mobile menu link
    const homeLink = screen.getByText('Home');
    fireEvent.click(homeLink);
    // Mobile menu should close
    expect(screen.queryByText('Home')).not.toBeInTheDocument();
  });
});
