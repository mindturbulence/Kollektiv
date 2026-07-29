import { describe, it, expect } from 'vitest';
import { MISSION_CONTROL_TARGET, missionControlTargetFromEnv } from './missionControlRoutes';

describe('missionControlTargetFromEnv', () => {
  it('defaults to port 3100 on loopback', () => {
    expect(missionControlTargetFromEnv({})).toBe('http://127.0.0.1:3100');
  });

  it('honours MISSION_CONTROL_PORT', () => {
    expect(missionControlTargetFromEnv({ MISSION_CONTROL_PORT: '4321' }))
      .toBe('http://127.0.0.1:4321');
  });

  it('ignores a non-numeric port rather than building a broken URL', () => {
    expect(missionControlTargetFromEnv({ MISSION_CONTROL_PORT: 'not-a-port' }))
      .toBe('http://127.0.0.1:3100');
  });

  it('exports a default target matching the no-env case', () => {
    expect(MISSION_CONTROL_TARGET).toBe(missionControlTargetFromEnv({}));
  });
});
