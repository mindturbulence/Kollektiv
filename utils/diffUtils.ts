/**
 * Utility functions for word-level LCS diffing and semantic metrics.
 */

export interface DiffToken {
    type: 'added' | 'removed' | 'preserved';
    text: string;
}

export interface SemanticMetrics {
    semanticOverlap: number;      // percentage of original words preserved
    expansionRatio: number;      // ratio of refined length to original length
    aestheticImprovement: number; // calculated visual score [0 - 100]
    enrichmentPurity: number;    // ratio of descriptive content additions
}

/**
 * Computes word-by-word diff between two prompts using the Longest Common Subsequence (LCS).
 * Preserves spaces and punctuation by splitting using regex boundary captures.
 */
export function computeWordDiff(original: string, refined: string): DiffToken[] {
    if (!original) {
        return [{ type: 'added', text: refined }];
    }
    if (!refined) {
        return [{ type: 'removed', text: original }];
    }

    const tokens1 = original.split(/(\b)/);
    const tokens2 = refined.split(/(\b)/);
    
    const dp: number[][] = Array(tokens1.length + 1)
        .fill(0)
        .map(() => Array(tokens2.length + 1).fill(0));
    
    for (let i = 1; i <= tokens1.length; i++) {
        for (let j = 1; j <= tokens2.length; j++) {
            if (tokens1[i - 1].toLowerCase() === tokens2[j - 1].toLowerCase()) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    
    const result: DiffToken[] = [];
    let i = tokens1.length;
    let j = tokens2.length;
    
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && tokens1[i - 1].toLowerCase() === tokens2[j - 1].toLowerCase()) {
            result.unshift({ type: 'preserved', text: tokens2[j - 1] });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            result.unshift({ type: 'added', text: tokens2[j - 1] });
            j--;
        } else {
            result.unshift({ type: 'removed', text: tokens1[i - 1] });
            i--;
        }
    }
    
    return result;
}

/**
 * Calculates semantic and visual metrics comparing original conceptual input and refined visual prose.
 */
export function calculateSemanticMetrics(original: string, refined: string, _activeModel: string): SemanticMetrics {
    const oWords = original.toLowerCase().match(/\b\w+\b/g) || [];
    const rWords = refined.toLowerCase().match(/\b\w+\b/g) || [];

    if (oWords.length === 0) {
        return {
            semanticOverlap: 0,
            expansionRatio: 0,
            aestheticImprovement: 0,
            enrichmentPurity: 0
        };
    }

    // Overlap: how many words of the original input are preserved in the refined prompt
    const rWordsSet = new Set(rWords);
    const commonWords = oWords.filter(w => rWordsSet.has(w));
    const semanticOverlap = Math.round((commonWords.length / oWords.length) * 100);

    // Expansion ratio: density multiplier
    const expansionRatio = parseFloat((rWords.length / oWords.length).toFixed(1));

    // Look for high-value descriptors (kinematic verbs, lighting terms, camera properties, acoustics, or mesh coords)
    const aestheticTriggers = [
        // Kinematics / Video
        'timeline', 'keyframe', 'movement', 'fps', 'dynamics', 'render', 'tracking', 'panning', 'orbit', 'kinetic', 'gravity',
        // Spatial / 3D
        'mesh', 'coordinates', 'vertices', 'normals', 'topology', 'depth', 'volume', '3d', 'poly', 'tessellation', 'extrusion',
        // Acoustic
        'soundstage', 'vocals', 'acoustic', 'decibel', 'cadence', 'rhythm', 'timbre', 'phonetic', 'genre', 'reverb', 'layer',
        // Visual quality
        'cinematic', 'photorealistic', 'illumination', 'volumetric', 'bokeh', 'shuter', 'exposure', 'gradient', 'anamorphic', 'octane', 'unreal'
    ];

    const triggersInRefined = rWords.filter(w => aestheticTriggers.includes(w)).length;
    
    // Improvement index: balances preservation of core concept with descriptive vocabulary expansion
    let improvementBase = 50; 
    
    // Add points for preserving original meaning (semantic loyalty)
    improvementBase += (semanticOverlap / 2); // master semantic retention
    
    // Add points for enriching the sentence (with ceiling)
    const densityBonus = Math.min(25, (expansionRatio - 1) * 8);
    improvementBase += Math.max(0, densityBonus);

    // Add points for structural cues / triggers
    const triggerBonus = Math.min(15, triggersInRefined * 3);
    improvementBase += triggerBonus;

    // Normalize score between 10 and 98 to keep it looking realistic and useful
    const aestheticImprovement = Math.round(Math.min(98, Math.max(12, improvementBase)));

    // Calculate enrichment purity
    const totalAdded = rWords.length - commonWords.length;
    const enrichmentPurity = Math.round(totalAdded > 0 ? (triggersInRefined / totalAdded) * 100 : 0);

    return {
        semanticOverlap,
        expansionRatio,
        aestheticImprovement,
        enrichmentPurity
    };
}
