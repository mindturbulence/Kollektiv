import React, { useState } from 'react';
import type { WildcardCategory } from '../types';
import { FolderClosedIcon } from './icons';

interface WildcardCategoryNodeProps {
    category: WildcardCategory;
    onWildcardClick: (path: string) => void;
    expandedPaths: Set<string>;
    onToggle: (path: string) => void;
}

const WildcardCategoryNode: React.FC<WildcardCategoryNodeProps> = ({ category, onWildcardClick, expandedPaths, onToggle }) => {
    const isExpanded = expandedPaths.has(category.path);
    
    const handleSummaryClick = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        onToggle(category.path);
    };
    
    return (
        <li key={category.path}>
            <details className="text-sm group" open={isExpanded}>
                <summary 
                    className="cursor-pointer list-none flex items-center gap-2 text-base-content/80 hover:text-base-content py-1"
                    onClick={handleSummaryClick}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transform transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                    <FolderClosedIcon className="w-4 h-4 inline-block"/>
                    <span className="text-sm font-medium">{category.name}</span>
                </summary>
                <div className="pl-4 border-l-2 border-base-300/50 ml-2 mt-1">
                    <div className="flex flex-wrap gap-1 py-2">
                        {category.files.map(file => {
                            const displayName = file.name;
                            const wildcardPath = file.path.replace(/\.txt$/i, '');
                            return (
                                <button 
                                    key={file.path} 
                                    onClick={() => onWildcardClick(wildcardPath)} 
                                    className="border border-base-300 hover:border-primary hover:text-primary transition-colors cursor-pointer text-sm py-0.5 px-2 h-auto rounded-[3px] bg-base-200/50 font-bold lowercase tracking-tight"
                                    title={`Insert __${wildcardPath}__`}
                                >
                                    {displayName}
                                </button>
                            );
                        })}
                    </div>
                    {category.subCategories && category.subCategories.length > 0 && (
                        <ul className="pl-0 space-y-1">
                           {category.subCategories.map(subCat => (
                               <WildcardCategoryNode 
                                   key={subCat.path}
                                   category={subCat}
                                   onWildcardClick={onWildcardClick}
                                   expandedPaths={expandedPaths}
                                   onToggle={onToggle}
                               />
                           ))}
                        </ul>
                    )}
                </div>
            </details>
        </li>
    );
};

interface WildcardTreeProps { 
    categories: WildcardCategory[]; 
    onWildcardClick: (path: string) => void;
}

const WildcardTree: React.FC<WildcardTreeProps> = ({ categories, onWildcardClick }) => {
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

    const handleToggle = (path: string) => {
        setExpandedPaths(prev => {
            const newSet = new Set(prev);
            if (newSet.has(path)) {
                newSet.delete(path);
            } else {
                newSet.add(path);
            }
            return newSet;
        });
    };

    return (
        <ul className="pl-2 space-y-1">
            {categories.map(category => (
                <WildcardCategoryNode 
                    key={category.path}
                    category={category}
                    onWildcardClick={onWildcardClick}
                    expandedPaths={expandedPaths}
                    onToggle={handleToggle}
                />
            ))}
        </ul>
    );
};

export default WildcardTree;