import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../src/components/Tabs.js';

afterEach(cleanup);

const Harness = ({ initial = 'a' }: { initial?: string }) => {
  const [value, setValue] = useState(initial);
  return (
    <Tabs value={value} onValueChange={setValue}>
      <TabsList ariaLabel="Sections">
        <TabsTrigger value="a">Alpha</TabsTrigger>
        <TabsTrigger value="b">Bravo</TabsTrigger>
        <TabsTrigger value="c">Charlie</TabsTrigger>
      </TabsList>
      <TabsContent value="a">Panneau A</TabsContent>
      <TabsContent value="b">Panneau B</TabsContent>
      <TabsContent value="c">Panneau C</TabsContent>
    </Tabs>
  );
};

describe('Tabs', () => {
  it('rend un tablist + 3 tabs accessibles', () => {
    render(<Harness />);
    expect(screen.getByRole('tablist', { name: 'Sections' })).toBeDefined();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('aria-selected reflète le tab actif', () => {
    render(<Harness initial="b" />);
    expect(screen.getByRole('tab', { name: 'Alpha' }).getAttribute('aria-selected')).toBe('false');
    expect(screen.getByRole('tab', { name: 'Bravo' }).getAttribute('aria-selected')).toBe('true');
  });

  it('click sur un trigger change le tab actif et appelle onValueChange', () => {
    const onValueChange = vi.fn();
    render(
      <Tabs value="a" onValueChange={onValueChange}>
        <TabsList ariaLabel="x">
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">contenu a</TabsContent>
        <TabsContent value="b">contenu b</TabsContent>
      </Tabs>,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'B' }));
    expect(onValueChange).toHaveBeenCalledWith('b');
  });

  it('ArrowRight passe au tab suivant et focus', () => {
    render(<Harness />);
    const triggerA = screen.getByRole('tab', { name: 'Alpha' });
    triggerA.focus();
    fireEvent.keyDown(triggerA, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Bravo' }).getAttribute('aria-selected')).toBe('true');
  });

  it('ArrowLeft cycle vers la fin depuis le premier', () => {
    render(<Harness />);
    const triggerA = screen.getByRole('tab', { name: 'Alpha' });
    triggerA.focus();
    fireEvent.keyDown(triggerA, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Charlie' }).getAttribute('aria-selected')).toBe('true');
  });

  it('Home et End focus début/fin', () => {
    render(<Harness initial="b" />);
    const triggerB = screen.getByRole('tab', { name: 'Bravo' });
    triggerB.focus();
    fireEvent.keyDown(triggerB, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Charlie' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Charlie' }), { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Alpha' }).getAttribute('aria-selected')).toBe('true');
  });

  it("le panneau actif n'est pas hidden, les autres le sont", () => {
    const { container } = render(<Harness initial="b" />);
    const panels = container.querySelectorAll('[role="tabpanel"]');
    expect(panels).toHaveLength(3);
    const panelById = (id: string): Element | null =>
      Array.from(panels).find((p) =>
        p.getAttribute('aria-labelledby')?.endsWith(`-trigger-${id}`),
      ) ?? null;
    expect(panelById('a')?.hasAttribute('hidden')).toBe(true);
    expect(panelById('b')?.hasAttribute('hidden')).toBe(false);
    expect(panelById('c')?.hasAttribute('hidden')).toBe(true);
  });

  it('forceMount=false démonte les panneaux inactifs', () => {
    const { container } = render(
      <Tabs value="a" onValueChange={vi.fn()}>
        <TabsList ariaLabel="x">
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a" forceMount={false}>
          contenu a
        </TabsContent>
        <TabsContent value="b" forceMount={false}>
          contenu b
        </TabsContent>
      </Tabs>,
    );
    expect(container.textContent).toContain('contenu a');
    expect(container.textContent).not.toContain('contenu b');
  });

  it('le trigger actif a tabIndex=0, les autres -1 (roving tabindex)', () => {
    render(<Harness initial="b" />);
    expect(screen.getByRole('tab', { name: 'Alpha' }).getAttribute('tabindex')).toBe('-1');
    expect(screen.getByRole('tab', { name: 'Bravo' }).getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('tab', { name: 'Charlie' }).getAttribute('tabindex')).toBe('-1');
  });

  it('throw si TabsTrigger est utilisé hors <Tabs>', () => {
    const renderOrphan = () =>
      render(
        <TabsList ariaLabel="x">
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>,
      );
    expect(renderOrphan).toThrow(/<Tabs>/);
  });
});
