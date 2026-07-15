import { useRef, useState, useEffect, useCallback, useMemo } from "react";

type VirtualListProps<T> = {
  items: T[];
  itemHeight: number;
  overscan?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onScroll?: (scrollTop: number) => void;
};

export function VirtualList<T>({
  items,
  itemHeight,
  overscan = 3,
  renderItem,
  className,
  style,
  onScroll
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    resizeObserver.observe(container);
    setContainerHeight(container.clientHeight);

    return () => resizeObserver.disconnect();
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const newScrollTop = e.currentTarget.scrollTop;
    setScrollTop(newScrollTop);
    onScroll?.(newScrollTop);
  }, [onScroll]);

  const { startIndex, endIndex, offsetTop } = useMemo(() => {
    const totalHeight = items.length * itemHeight;

    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const end = Math.min(items.length - 1, start + visibleCount + overscan * 2);

    return {
      startIndex: start,
      endIndex: end,
      offsetTop: start * itemHeight,
      totalHeight
    };
  }, [items.length, itemHeight, scrollTop, containerHeight, overscan]);

  const visibleItems = useMemo(() => {
    return items.slice(startIndex, endIndex + 1);
  }, [items, startIndex, endIndex]);

  const totalHeight = items.length * itemHeight;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        ...style,
        overflow: "auto",
        position: "relative"
      }}
      onScroll={handleScroll}
    >
      {                 }
      <div style={{ height: totalHeight, position: "relative" }}>
        {            }
        <div
          style={{
            position: "absolute",
            top: offsetTop,
            left: 0,
            right: 0
          }}
        >
          {visibleItems.map((item, index) => (
            <div
              key={startIndex + index}
              style={{ height: itemHeight }}
            >
              {renderItem(item, startIndex + index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SmartList<T>({
  items,
  itemHeight,
  threshold = 50,
  ...props
}: VirtualListProps<T> & { threshold?: number }) {

  if (items.length <= threshold) {
    return (
      <div className={props.className} style={{ ...props.style, overflow: "auto" }}>
        {items.map((item, index) => (
          <div key={index} style={{ height: itemHeight }}>
            {props.renderItem(item, index)}
          </div>
        ))}
      </div>
    );
  }

  return <VirtualList items={items} itemHeight={itemHeight} {...props} />;
}
