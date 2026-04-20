'use client';

import React, { useState, useRef, useEffect } from 'react';

interface Tab {
  id?: string;
  value?: string;
  label: string;
  content?: React.ReactNode;
  disabled?: boolean;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  activeTab?: string;
  onChange?: (tabId: string) => void;
  onTabChange?: (tabId: string) => void;
  className?: string;
}

export function Tabs({
  tabs,
  defaultTab,
  activeTab: controlledActiveTab,
  onChange,
  onTabChange,
  className = '',
}: TabsProps) {
  // Normalise tabs to always have an id
  const normalisedTabs = tabs.map((t) => ({ ...t, id: t.id || t.value || t.label }));
  const isControlled = controlledActiveTab !== undefined;
  const [internalActiveTab, setInternalActiveTab] = useState(defaultTab || normalisedTabs[0]?.id || '');
  const activeTab = isControlled ? controlledActiveTab : internalActiveTab;
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const tabListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const activeEl = tabRefs.current.get(activeTab);
    if (activeEl && tabListRef.current) {
      const listRect = tabListRef.current.getBoundingClientRect();
      const tabRect = activeEl.getBoundingClientRect();
      setIndicatorStyle({
        left: tabRect.left - listRect.left,
        width: tabRect.width,
      });
    }
  }, [activeTab]);

  const handleTabClick = (tabId: string) => {
    if (!isControlled) setInternalActiveTab(tabId);
    onChange?.(tabId);
    onTabChange?.(tabId);
  };

  const activeContent = normalisedTabs.find((t) => t.id === activeTab)?.content;

  return (
    <div className={className}>
      {/* Tab list */}
      <div
        ref={tabListRef}
        className="relative flex border-b border-gray-200"
        role="tablist"
      >
        {normalisedTabs.map((tab) => (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) tabRefs.current.set(tab.id, el);
            }}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            disabled={tab.disabled}
            onClick={() => handleTabClick(tab.id)}
            className={`
              relative px-4 py-3 text-sm font-medium transition-colors duration-200
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-300)] focus-visible:ring-inset
              disabled:text-gray-300 disabled:cursor-not-allowed
              ${
                activeTab === tab.id
                  ? 'text-[var(--color-primary-600)]'
                  : 'text-gray-500 hover:text-gray-700'
              }
            `}
          >
            {tab.label}
          </button>
        ))}
        {/* Animated indicator */}
        <div
          className="tab-indicator"
          style={{
            left: indicatorStyle.left,
            width: indicatorStyle.width,
          }}
        />
      </div>

      {/* Tab panels */}
      <div
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={activeTab}
        className="pt-4 animate-fade-in"
      >
        {activeContent}
      </div>
    </div>
  );
}

export default Tabs;
