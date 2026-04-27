import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DiscordMessagePreview,
  renderDiscordMarkdown,
  substituteVariables,
} from '../../src/components/DiscordMessagePreview.js';

afterEach(cleanup);

describe('renderDiscordMarkdown', () => {
  it('rend du texte simple en paragraphe', () => {
    expect(renderDiscordMarkdown('Hello world')).toBe('<p>Hello world</p>');
  });

  it('rend **gras** en <strong>', () => {
    expect(renderDiscordMarkdown('Du **gras** ici')).toContain('<strong>gras</strong>');
  });

  it('rend *italique* en <em>', () => {
    expect(renderDiscordMarkdown('Du *italique* ici')).toContain('<em>italique</em>');
  });

  it('rend __souligné__ en <u>', () => {
    expect(renderDiscordMarkdown('Du __souligné__ ici')).toContain('<u>souligné</u>');
  });

  it('rend ~~barré~~ en <s>', () => {
    expect(renderDiscordMarkdown('Du ~~barré~~ ici')).toContain('<s>barré</s>');
  });

  it('rend `code` inline en <code>', () => {
    const out = renderDiscordMarkdown('Une ligne avec `du code` inline');
    expect(out).toContain('<code');
    expect(out).toContain('du code</code>');
  });

  it('rend les blocs ```...``` en <pre><code>', () => {
    const md = ['```', 'console.log("hi")', '```'].join('\n');
    const out = renderDiscordMarkdown(md);
    expect(out).toContain('<pre');
    expect(out).toContain('console.log');
  });

  it('rend les listes - en <ul><li>', () => {
    const md = '- alpha\n- bravo';
    const out = renderDiscordMarkdown(md);
    expect(out).toContain('<ul');
    expect(out).toContain('<li>alpha</li>');
    expect(out).toContain('<li>bravo</li>');
  });

  it('rend les listes 1. en <ol><li>', () => {
    const md = '1. alpha\n2. bravo';
    const out = renderDiscordMarkdown(md);
    expect(out).toContain('<ol');
    expect(out).toContain('<li>alpha</li>');
    expect(out).toContain('<li>bravo</li>');
  });

  it('listes : exige un whitespace après le marker (-foo n est pas une liste)', () => {
    const out = renderDiscordMarkdown('-foo\n*bar\n1.baz');
    expect(out).not.toContain('<ul');
    expect(out).not.toContain('<ol');
    expect(out).toContain('<p>-foo</p>');
    expect(out).toContain('<p>*bar</p>');
    expect(out).toContain('<p>1.baz</p>');
  });

  it('listes : tolère plusieurs whitespaces après le marker', () => {
    const longSpaces = `-${' '.repeat(1000)}item`;
    const out = renderDiscordMarkdown(longSpaces);
    expect(out).toContain('<ul');
    expect(out).toContain('<li>item</li>');
  });

  it('listes ordonnées : borne sur le nombre de chiffres (>9 chiffres → paragraphe)', () => {
    const out = renderDiscordMarkdown('1234567890. trop de chiffres');
    expect(out).not.toContain('<ol');
    expect(out).toContain('<p>1234567890. trop de chiffres</p>');
  });

  it('listes : aucun ReDoS exploitable même sur ligne très longue (sanity O(n))', () => {
    const longLine = `-${'a'.repeat(100_000)}`;
    const start = Date.now();
    renderDiscordMarkdown(longLine);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });

  it('rend > en blockquote', () => {
    const out = renderDiscordMarkdown('> citation discrète');
    expect(out).toContain('<blockquote');
    expect(out).toContain('citation discrète');
  });

  it('rend les mentions <@id> comme chip @membre', () => {
    const out = renderDiscordMarkdown('<@123456789012345678> bienvenue');
    expect(out).toContain('@membre');
  });

  it('rend les mentions <#id> comme chip #salon', () => {
    const out = renderDiscordMarkdown('Voir <#123456789012345678>');
    expect(out).toContain('#salon');
  });

  it('rend les mentions <@&id> comme chip @rôle', () => {
    const out = renderDiscordMarkdown('<@&123456789012345678> ping');
    expect(out).toContain('@rôle');
  });

  it('échappe les < et > injectés (sécurité)', () => {
    const out = renderDiscordMarkdown('<script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('échappe les & dans le texte', () => {
    const out = renderDiscordMarkdown('Tom & Jerry');
    expect(out).toContain('Tom &amp; Jerry');
  });

  it('combine gras + italique sans casser', () => {
    const out = renderDiscordMarkdown('**gras *italique* gras**');
    expect(out).toContain('<strong>');
    expect(out).toContain('<em>italique</em>');
  });

  it('vide → string vide', () => {
    expect(renderDiscordMarkdown('')).toBe('');
  });
});

describe('DiscordMessagePreview', () => {
  it('rend le nom du bot et le badge BOT', () => {
    render(<DiscordMessagePreview botName="Varde Bot" content="hello" />);
    expect(screen.getByText('Varde Bot')).toBeDefined();
    expect(screen.getByText('BOT')).toBeDefined();
  });

  it('rend le placeholder quand content vide et pas d attachments', () => {
    render(<DiscordMessagePreview botName="Varde Bot" content="" />);
    expect(screen.getByText('Contenu du message…')).toBeDefined();
  });

  it('emptyPlaceholder override le défaut', () => {
    render(
      <DiscordMessagePreview botName="x" content="" emptyPlaceholder="Ajoute du contenu ici" />,
    );
    expect(screen.getByText('Ajoute du contenu ici')).toBeDefined();
  });

  it('rend des boutons en rangées de 5 max', () => {
    render(
      <DiscordMessagePreview
        botName="x"
        content=""
        attachments={Array.from({ length: 7 }, (_, i) => ({
          kind: 'button' as const,
          label: `B${i + 1}`,
          style: 'primary' as const,
        }))}
      />,
    );
    expect(screen.getByText('B1')).toBeDefined();
    expect(screen.getByText('B7')).toBeDefined();
  });

  it('rend des réactions avec compteur', () => {
    render(
      <DiscordMessagePreview
        botName="x"
        content="message"
        attachments={[
          { kind: 'reaction', emoji: '🔥', count: 3 },
          { kind: 'reaction', emoji: '🎉' },
        ]}
      />,
    );
    expect(screen.getByText('🔥')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();
    expect(screen.getByText('🎉')).toBeDefined();
    expect(screen.getByText('1')).toBeDefined();
  });

  it('rend la footnote sous le message', () => {
    render(<DiscordMessagePreview botName="x" content="hi" footnote="Aperçu indicatif" />);
    expect(screen.getByText('Aperçu indicatif')).toBeDefined();
  });

  it('substitue les variables dans content', () => {
    render(
      <DiscordMessagePreview
        botName="x"
        content="Bienvenue {user} !"
        variables={{ user: 'Alice' }}
      />,
    );
    expect(screen.getByText(/Bienvenue Alice !/)).toBeDefined();
  });

  it("rend l'embed avec border-color quand fourni", () => {
    const { container } = render(
      <DiscordMessagePreview
        botName="x"
        content=""
        embed={{ color: '#5865F2', content: 'Coucou' }}
      />,
    );
    expect(screen.getByText('Coucou')).toBeDefined();
    const embedBlock = container.querySelector('[style*="border-left-color"]');
    expect(embedBlock).not.toBeNull();
  });

  it('substitue les variables dans embed.content aussi', () => {
    render(
      <DiscordMessagePreview
        botName="x"
        content=""
        embed={{ color: '#000000', content: 'Hello {user}' }}
        variables={{ user: 'Bob' }}
      />,
    );
    expect(screen.getByText(/Hello Bob/)).toBeDefined();
  });

  it("rend cardImageUrl en dehors de l'embed quand pas d'embed", () => {
    const { container } = render(
      <DiscordMessagePreview
        botName="x"
        content="message"
        cardImageUrl="data:image/png;base64,iVBORw0KGgo="
      />,
    );
    const img = container.querySelector('img[src^="data:image"]');
    expect(img).not.toBeNull();
  });

  it("affiche le placeholder de chargement quand cardLoading=true et pas d'image", () => {
    render(<DiscordMessagePreview botName="x" content="msg" cardLoading={true} />);
    expect(screen.getByLabelText('Génération de la carte en cours')).toBeDefined();
  });

  it("rend cardImageUrl DANS l'embed quand embed fourni", () => {
    const { container } = render(
      <DiscordMessagePreview
        botName="x"
        content=""
        embed={{ color: '#000', content: 'embedded' }}
        cardImageUrl="data:image/png;base64,xxx"
      />,
    );
    // L'image doit être à l'intérieur du block d'embed
    const embed = container.querySelector('[style*="border-left-color"]');
    expect(embed?.querySelector('img')).not.toBeNull();
  });

  it('variables : ne touche pas aux clés non fournies', () => {
    render(
      <DiscordMessagePreview
        botName="x"
        content="Hello {user} et {missing}"
        variables={{ user: 'Alice' }}
      />,
    );
    expect(screen.getByText(/Hello Alice et \{missing\}/)).toBeDefined();
  });
});

describe('substituteVariables', () => {
  it('remplace les clés présentes', () => {
    expect(substituteVariables('Hello {a} et {b}', { a: 'X', b: 'Y' })).toBe('Hello X et Y');
  });

  it('laisse les clés absentes intactes', () => {
    expect(substituteVariables('Hello {a} et {missing}', { a: 'X' })).toBe('Hello X et {missing}');
  });

  it('accepte les valeurs numériques', () => {
    expect(substituteVariables('{count} membres', { count: 42 })).toBe('42 membres');
  });

  it('retourne raw inchangé si variables undefined', () => {
    expect(substituteVariables('Hello {a}', undefined)).toBe('Hello {a}');
  });

  it('retourne raw inchangé si variables vide', () => {
    expect(substituteVariables('Hello {a}', {})).toBe('Hello {a}');
  });

  it('supporte clés avec point (user.mention)', () => {
    expect(substituteVariables('Yo {user.mention}', { 'user.mention': '@Alice' })).toBe(
      'Yo @Alice',
    );
  });
});
