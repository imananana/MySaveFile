import { FileName } from '../common/FileName';

/**
 * Wrong file, said once, in one place.
 *
 * A `.save` and a `.package` are the same DBPF container, so "not a Sims 4
 * file" and "a Sims 4 file that isn't a save" both end up here — and both call
 * for exactly the same move, so they get exactly the same words. Saves are a
 * whole numbered family (Slot_00000001, Slot_0000000c, the .ver backups), so
 * the useful thing to name is the ending, not one example filename.
 *
 * Shared by the first-time import and the re-sync because the two used to
 * disagree about what a wrong file even was.
 */
export const WRONG_FILE = {
  title: 'Wrong file type',
  detail: <>The file you're looking for ends in <FileName>.save</FileName>.</>,
};
