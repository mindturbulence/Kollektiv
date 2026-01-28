import React, { useState, useCallback, useEffect } from 'react';
import { FolderOpenIcon, FolderClosedIcon, ChevronRightIcon } from './icons';

export interface TreeViewItem {
  id: string;
  name: string;
  icon?: 'home' | 'inbox' | 'folder' | 'app' | 'prompt';
  children?: TreeViewItem[];
  count?: number;
}

interface TreeViewProps {
  items: TreeViewItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  searchActive?: boolean;
}

const TreeViewNode: React.FC<{ 
    item: TreeViewItem; 
    selectedId: string; 
    onSelect: (id: string) => void; 
    level: number;
    expandedIds: Set<string>;
    onToggleExpand: (id: string) => void;
    searchActive?: boolean;
}> = ({ item, selectedId, onSelect, level, expandedIds, onToggleExpand, searchActive }) => {
  
  const isSelected = item.id === selectedId;
  const hasChildren = item.children && item.children.length > 0;
  // If search is active, always expand if it has children
  const isExpanded = hasChildren && (searchActive || expandedIds.has(item.id));

  const getIcon = () => {
    return isSelected
      ? <FolderOpenIcon className="w-5 h-5 mr-3 flex-shrink-0" />
      : <FolderClosedIcon className="w-5 h-5 mr-3 flex-shrink-0" />;
  };
  
  const handleNodeClick = () => {
      onSelect(item.id);
      if (hasChildren && !searchActive) {
          onToggleExpand(item.id);
      }
  };

  return (
    <li>
      <button
        onClick={handleNodeClick}
        style={{ paddingLeft: `${level * 1}rem` }}
        className={`w-full text-left p-2.5 rounded-md text-sm transition-colors flex items-center justify-between ${isSelected ? 'bg-primary text-primary-content font-semibold shadow-md' : 'hover:bg-base-200'}`}
      >
        <div className="flex items-center min-w-0">
          {hasChildren && (
            <ChevronRightIcon className={`w-4 h-4 mr-1 flex-shrink-0 transition-transform duration-150 ${isExpanded ? 'rotate-90' : 'rotate-0'}`} />
          )}
          <div className="mr-2 flex-shrink-0" style={{ paddingLeft: hasChildren ? '0' : '1.25rem' }}>{getIcon()}</div>
          <span className="truncate" title={item.name}>{item.name}</span>
        </div>
        {typeof item.count !== 'undefined' && (
          <span className="ml-2 flex-shrink-0 text-xs font-mono bg-base-300/50 text-base-content/70 rounded-full px-2 py-0.5">
            {item.count}
          </span>
        )}
      </button>
      {hasChildren && isExpanded && (
        <ul className="space-y-1 mt-1">
          {item.children?.map(child => (
            <TreeViewNode 
                key={child.id} 
                item={child} 
                selectedId={selectedId} 
                onSelect={onSelect} 
                level={level + 1}
                expandedIds={expandedIds}
                onToggleExpand={onToggleExpand}
                searchActive={searchActive}
            />
          ))}
        </ul>
      )}
    </li>
  );
};


const TreeView: React.FC<TreeViewProps> = ({ items, selectedId, onSelect, searchActive }) => {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(['all']));

    const handleToggleExpand = useCallback((id: string) => {
        setExpandedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    }, []);

    return (
        <nav aria-label="Category navigation">
        <ul className="space-y-1">
            {items.map(item => (
            <TreeViewNode 
                key={item.id} 
                item={item} 
                selectedId={selectedId} 
                onSelect={onSelect} 
                level={0}
                expandedIds={expandedIds}
                onToggleExpand={handleToggleExpand}
                searchActive={searchActive}
            />
            ))}
        </ul>
        </nav>
    );
};


export default TreeView;