/**
 * Eval Action
 * Executes arbitrary JavaScript in the context of the page
 */

import type { EvalParams } from '../../shared/types';

/**
 * Execute script
 * @param params - Eval parameters
 * @returns The result of the script execution
 */
export async function evalScript(params: EvalParams): Promise<any> {
    const { script } = params;

    // Use a Function constructor to execute the script in a relatively isolated way
    // but still with access to the window and document.
    try {
        const fn = new Function(script);
        return fn();
    } catch (error) {
        throw new Error(`Script execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
