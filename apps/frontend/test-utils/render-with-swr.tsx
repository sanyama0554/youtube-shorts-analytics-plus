import { render } from '@testing-library/react';
import { ReactElement } from 'react';
import { SWRConfig } from 'swr';

// SWRのキャッシュはデフォルトでモジュール全体を跨いで共有されるため、
// テストごとにMapを作り直して他テストのキャッシュ汚染を防ぐ。
export function renderWithFreshSWR(ui: ReactElement) {
  return render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>);
}
