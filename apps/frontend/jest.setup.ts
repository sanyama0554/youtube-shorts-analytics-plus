import '@testing-library/jest-dom';

// RechartsのResponsiveContainerがResizeObserverを使うが、jsdomには存在しないためモックする。
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock;
