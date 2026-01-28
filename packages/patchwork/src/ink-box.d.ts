declare module 'ink-box' {
  import { ReactElement } from 'react';

  export interface BoxProps {
    children: ReactElement | string;
    padding?: number;
    margin?: number;
    borderStyle?: string;
    borderColor?: string;
  }

  export default function Box(props: BoxProps): ReactElement;
}
