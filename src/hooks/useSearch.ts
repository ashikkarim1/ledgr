/**
 * useSearch Hook
 * Global search functionality with Cmd+K support
 */

import { useState, useEffect, useCallback } from 'react';

interface SearchResult {
  id: string;
  title: string;
  type: 'page' | 'transaction' | 'agent' | 'document';
  path: string;
}

export const useSearch = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Mock search implementation - replace with actual API
  const performSearch = useCallback((q: string): SearchResult[] => {
    if (!q.trim()) return [];

    const mockData: SearchResult[] = [
      { id: '1', title: 'Financial Dashboard', type: 'page', path: '/financial' },
      { id: '2', title: 'Team Members', type: 'page', path: '/team' },
      { id: '3', title: 'Recent Transaction #4521', type: 'transaction', path: '/transactions/4521' },
      { id: '4', title: 'Chief Accountant', type: 'agent', path: '/agents/ca' },
    ];

    return mockData.filter(item =>
      item.title.toLowerCase().includes(q.toLowerCase())
    );
  }, []);

  // Handle Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Update search results
  useEffect(() => {
    if (query.trim()) {
      setResults(performSearch(query));
      setSelectedIndex(0);
    } else {
      setResults([]);
    }
  }, [query, performSearch]);

  const handleSelect = useCallback((result: SearchResult) => {
    window.location.href = result.path;
    setIsOpen(false);
    setQuery('');
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => (i + 1) % Math.max(1, results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => (i - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    }
  }, [results, selectedIndex, handleSelect]);

  return {
    isOpen,
    setIsOpen,
    query,
    setQuery,
    results,
    selectedIndex,
    setSelectedIndex,
    handleSelect,
    handleKeyDown,
  };
};
