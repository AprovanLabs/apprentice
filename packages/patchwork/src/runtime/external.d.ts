// Type declarations for external modules with ESM export mapping issues

declare module 'ink' {
  import { ReactElement, ReactNode } from 'react';

  export interface Instance {
    rerender: (element: ReactElement) => void;
    unmount: () => void;
    waitUntilExit: () => Promise<void>;
    clear: () => void;
  }

  export interface RenderOptions {
    stdout?: NodeJS.WriteStream;
    stdin?: NodeJS.ReadStream;
    stderr?: NodeJS.WriteStream;
    debug?: boolean;
    exitOnCtrlC?: boolean;
    patchConsole?: boolean;
  }

  export function render(
    element: ReactElement,
    options?: RenderOptions,
  ): Instance;

  export interface BoxProps {
    children?: ReactNode;
    flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
    flexGrow?: number;
    flexShrink?: number;
    flexBasis?: number | string;
    alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
    alignSelf?: 'auto' | 'flex-start' | 'center' | 'flex-end' | 'stretch';
    justifyContent?:
      | 'flex-start'
      | 'center'
      | 'flex-end'
      | 'space-between'
      | 'space-around'
      | 'space-evenly';
    width?: number | string;
    height?: number | string;
    minWidth?: number | string;
    minHeight?: number | string;
    paddingTop?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    paddingRight?: number;
    paddingX?: number;
    paddingY?: number;
    padding?: number;
    marginTop?: number;
    marginBottom?: number;
    marginLeft?: number;
    marginRight?: number;
    marginX?: number;
    marginY?: number;
    margin?: number;
    gap?: number;
    borderStyle?:
      | 'single'
      | 'double'
      | 'round'
      | 'bold'
      | 'singleDouble'
      | 'doubleSingle'
      | 'classic'
      | 'arrow';
    borderColor?: string;
    borderTop?: boolean;
    borderBottom?: boolean;
    borderLeft?: boolean;
    borderRight?: boolean;
    display?: 'flex' | 'none';
    overflow?: 'visible' | 'hidden';
  }

  export interface TextProps {
    children?: ReactNode;
    color?: string;
    backgroundColor?: string;
    dimColor?: boolean;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    inverse?: boolean;
    wrap?:
      | 'wrap'
      | 'end'
      | 'middle'
      | 'truncate-end'
      | 'truncate'
      | 'truncate-middle'
      | 'truncate-start';
  }

  export const Box: React.FC<BoxProps>;
  export const Text: React.FC<TextProps>;
  export const Static: React.FC<{
    items: unknown[];
    children: (item: unknown, index: number) => ReactElement;
  }>;
  export const Newline: React.FC;
  export const Spacer: React.FC;

  export function useInput(
    inputHandler: (
      input: string,
      key: {
        upArrow: boolean;
        downArrow: boolean;
        leftArrow: boolean;
        rightArrow: boolean;
        return: boolean;
        escape: boolean;
        ctrl: boolean;
        shift: boolean;
        tab: boolean;
        backspace: boolean;
        delete: boolean;
        pageDown: boolean;
        pageUp: boolean;
        meta: boolean;
      },
    ) => void,
    options?: { isActive?: boolean },
  ): void;

  export function useApp(): { exit: (error?: Error) => void };
  export function useFocus(options?: {
    autoFocus?: boolean;
    isActive?: boolean;
    id?: string;
  }): { isFocused: boolean };
  export function useFocusManager(): {
    focusNext: () => void;
    focusPrevious: () => void;
    focus: (id: string) => void;
    enableFocus: () => void;
    disableFocus: () => void;
  };
  export function useStdin(): {
    stdin: NodeJS.ReadStream;
    isRawModeSupported: boolean;
    setRawMode: (mode: boolean) => void;
  };
  export function useStdout(): {
    stdout: NodeJS.WriteStream;
    write: (data: string) => void;
  };
  export function useStderr(): {
    stderr: NodeJS.WriteStream;
    write: (data: string) => void;
  };
}

declare module 'marked-terminal' {
  import { MarkedExtension } from 'marked';

  export interface MarkedTerminalOptions {
    width?: number;
    reflowText?: boolean;
    showSectionPrefix?: boolean;
    unescape?: boolean;
    emoji?: boolean;
    tableOptions?: Record<string, unknown>;
    tab?: number;
    heading?: (text: string) => string;
    firstHeading?: (text: string) => string;
    code?: (text: string) => string;
    blockquote?: (text: string) => string;
    html?: (text: string) => string;
    hr?: () => string;
    list?: (body: string, ordered: boolean) => string;
    listitem?: (text: string) => string;
    paragraph?: (text: string) => string;
    table?: (header: string, body: string) => string;
    tablerow?: (text: string) => string;
    tablecell?: (
      text: string,
      flags: { header: boolean; align: string },
    ) => string;
    strong?: (text: string) => string;
    em?: (text: string) => string;
    codespan?: (text: string) => string;
    br?: () => string;
    del?: (text: string) => string;
    link?: (href: string, title: string, text: string) => string;
    image?: (href: string, title: string, text: string) => string;
  }

  export function markedTerminal(
    options?: MarkedTerminalOptions,
  ): MarkedExtension;
}
