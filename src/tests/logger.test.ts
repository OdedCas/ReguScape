/**
 * Tests for the logger service
 */

import { logger, log, getLogs, getLogsByAction, getLogsByStatus, clearLogs } from '../services/logger';

describe('Logger Service', () => {
  beforeEach(() => {
    clearLogs();
  });

  describe('log()', () => {
    it('should create a log entry with all required fields', () => {
      const entry = log({
        action: 'test_action',
        input: { key: 'value' },
        output: { result: 'success' },
        status: 'success',
      });

      expect(entry.id).toBeDefined();
      expect(entry.timestamp).toBeDefined();
      expect(entry.action).toBe('test_action');
      expect(entry.input).toEqual({ key: 'value' });
      expect(entry.output).toEqual({ result: 'success' });
      expect(entry.status).toBe('success');
    });

    it('should include optional error and duration', () => {
      const entry = log({
        action: 'test_action',
        input: {},
        output: null,
        status: 'error',
        error: 'Something went wrong',
        duration: 150,
      });

      expect(entry.error).toBe('Something went wrong');
      expect(entry.duration).toBe(150);
    });

    it('should add entry to in-memory storage', () => {
      log({
        action: 'test_action',
        input: {},
        output: null,
        status: 'success',
      });

      const logs = getLogs();
      expect(logs.length).toBe(1);
    });

    it('should generate unique IDs for each entry', () => {
      const entry1 = log({
        action: 'action1',
        input: {},
        output: null,
        status: 'success',
      });

      const entry2 = log({
        action: 'action2',
        input: {},
        output: null,
        status: 'success',
      });

      expect(entry1.id).not.toBe(entry2.id);
    });
  });

  describe('getLogs()', () => {
    it('should return all logs', () => {
      log({ action: 'action1', input: {}, output: null, status: 'success' });
      log({ action: 'action2', input: {}, output: null, status: 'error' });
      log({ action: 'action3', input: {}, output: null, status: 'pending' });

      const logs = getLogs();
      expect(logs.length).toBe(3);
    });

    it('should return a copy of the logs array', () => {
      log({ action: 'action1', input: {}, output: null, status: 'success' });

      const logs1 = getLogs();
      const logs2 = getLogs();

      expect(logs1).not.toBe(logs2);
      expect(logs1).toEqual(logs2);
    });
  });

  describe('getLogsByAction()', () => {
    it('should filter logs by action', () => {
      log({ action: 'search', input: {}, output: null, status: 'success' });
      log({ action: 'search', input: {}, output: null, status: 'success' });
      log({ action: 'other', input: {}, output: null, status: 'success' });

      const searchLogs = getLogsByAction('search');
      expect(searchLogs.length).toBe(2);
      expect(searchLogs.every((l) => l.action === 'search')).toBe(true);
    });

    it('should return empty array if no matching logs', () => {
      log({ action: 'search', input: {}, output: null, status: 'success' });

      const logs = getLogsByAction('nonexistent');
      expect(logs.length).toBe(0);
    });
  });

  describe('getLogsByStatus()', () => {
    it('should filter logs by status', () => {
      log({ action: 'action1', input: {}, output: null, status: 'success' });
      log({ action: 'action2', input: {}, output: null, status: 'error' });
      log({ action: 'action3', input: {}, output: null, status: 'success' });

      const successLogs = getLogsByStatus('success');
      expect(successLogs.length).toBe(2);
      expect(successLogs.every((l) => l.status === 'success')).toBe(true);

      const errorLogs = getLogsByStatus('error');
      expect(errorLogs.length).toBe(1);
    });
  });

  describe('clearLogs()', () => {
    it('should clear all logs from memory', () => {
      log({ action: 'action1', input: {}, output: null, status: 'success' });
      log({ action: 'action2', input: {}, output: null, status: 'success' });

      expect(getLogs().length).toBe(2);

      clearLogs();

      expect(getLogs().length).toBe(0);
    });
  });

  describe('logger object', () => {
    it('should export all functions', () => {
      expect(logger.log).toBe(log);
      expect(logger.getLogs).toBe(getLogs);
      expect(logger.getLogsByAction).toBe(getLogsByAction);
      expect(logger.getLogsByStatus).toBe(getLogsByStatus);
      expect(logger.clearLogs).toBe(clearLogs);
    });
  });
});
