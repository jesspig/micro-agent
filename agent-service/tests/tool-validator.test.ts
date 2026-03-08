/**
 * JSON Schema 验证器单元测试
 */

import { describe, it, expect } from 'bun:test';
import {
  validateAgainstSchema,
  validateRequired,
  validateType,
  isValid,
} from '../runtime/capability/tool-system/schema-validator';
import type { JSONSchema } from '../types';

describe('validateType', () => {
  it('应正确验证 string 类型', () => {
    expect(validateType('hello', 'string')).toBe(true);
    expect(validateType(123, 'string')).toBe(false);
    expect(validateType('', 'string')).toBe(true);
  });

  it('应正确验证 number 类型', () => {
    expect(validateType(123, 'number')).toBe(true);
    expect(validateType(3.14, 'number')).toBe(true);
    expect(validateType(NaN, 'number')).toBe(false);
    expect(validateType('123', 'number')).toBe(false);
  });

  it('应正确验证 integer 类型', () => {
    expect(validateType(123, 'integer')).toBe(true);
    expect(validateType(3.14, 'integer')).toBe(false);
    expect(validateType(-5, 'integer')).toBe(true);
  });

  it('应正确验证 boolean 类型', () => {
    expect(validateType(true, 'boolean')).toBe(true);
    expect(validateType(false, 'boolean')).toBe(true);
    expect(validateType(1, 'boolean')).toBe(false);
  });

  it('应正确验证 array 类型', () => {
    expect(validateType([], 'array')).toBe(true);
    expect(validateType([1, 2, 3], 'array')).toBe(true);
    expect(validateType({}, 'array')).toBe(false);
  });

  it('应正确验证 object 类型', () => {
    expect(validateType({}, 'object')).toBe(true);
    expect(validateType({ a: 1 }, 'object')).toBe(true);
    expect(validateType([], 'object')).toBe(false);
    expect(validateType(null, 'object')).toBe(false);
  });

  it('应正确验证 null 类型', () => {
    expect(validateType(null, 'null')).toBe(true);
    expect(validateType(undefined, 'null')).toBe(false);
    expect(validateType('', 'null')).toBe(false);
  });
});

describe('validateRequired', () => {
  it('应通过有所有必填字段的对象', () => {
    const errors = validateRequired({ name: 'test', age: 25 }, ['name', 'age']);
    expect(errors.length).toBe(0);
  });

  it('应检测缺失的必填字段', () => {
    const errors = validateRequired({ name: 'test' }, ['name', 'age']);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('age');
  });

  it('应检测多个缺失的必填字段', () => {
    const errors = validateRequired({}, ['name', 'age', 'email']);
    expect(errors.length).toBe(3);
  });

  it('应将 undefined 值视为缺失', () => {
    const errors = validateRequired({ name: undefined }, ['name']);
    expect(errors.length).toBe(1);
  });

  it('应对非对象输入返回错误', () => {
    const errors = validateRequired('string', ['name']);
    expect(errors.length).toBe(1);
    expect(errors[0].constraint).toBe('required');
  });
});

describe('validateAgainstSchema', () => {
  describe('类型验证', () => {
    it('应验证基本类型', () => {
      const schema: JSONSchema = { type: 'string' };
      expect(validateAgainstSchema('hello', schema).valid).toBe(true);
      expect(validateAgainstSchema(123, schema).valid).toBe(false);
    });

    it('应支持联合类型', () => {
      const schema: JSONSchema = { type: ['string', 'number'] };
      expect(validateAgainstSchema('hello', schema).valid).toBe(true);
      expect(validateAgainstSchema(123, schema).valid).toBe(true);
      expect(validateAgainstSchema(true, schema).valid).toBe(false);
    });

    it('应允许 null 输入当类型包含 null', () => {
      const schema: JSONSchema = { type: ['string', 'null'] };
      expect(validateAgainstSchema(null, schema).valid).toBe(true);
    });
  });

  describe('枚举验证', () => {
    it('应验证枚举值', () => {
      const schema: JSONSchema = { enum: ['red', 'green', 'blue'] };
      expect(validateAgainstSchema('red', schema).valid).toBe(true);
      expect(validateAgainstSchema('yellow', schema).valid).toBe(false);
    });

    it('应支持混合类型枚举', () => {
      const schema: JSONSchema = { enum: [1, '1', true, null] };
      expect(validateAgainstSchema(1, schema).valid).toBe(true);
      expect(validateAgainstSchema('1', schema).valid).toBe(true);
      expect(validateAgainstSchema(true, schema).valid).toBe(true);
      expect(validateAgainstSchema(null, schema).valid).toBe(true);
      expect(validateAgainstSchema(false, schema).valid).toBe(false);
    });
  });

  describe('字符串约束', () => {
    it('应验证 minLength', () => {
      const schema: JSONSchema = { type: 'string', minLength: 3 };
      expect(validateAgainstSchema('hello', schema).valid).toBe(true);
      expect(validateAgainstSchema('ab', schema).valid).toBe(false);
    });

    it('应验证 maxLength', () => {
      const schema: JSONSchema = { type: 'string', maxLength: 5 };
      expect(validateAgainstSchema('hello', schema).valid).toBe(true);
      expect(validateAgainstSchema('hello world', schema).valid).toBe(false);
    });

    it('应验证 pattern', () => {
      const schema: JSONSchema = { type: 'string', pattern: '^\\d{3}-\\d{4}$' };
      expect(validateAgainstSchema('123-4567', schema).valid).toBe(true);
      expect(validateAgainstSchema('abc-defg', schema).valid).toBe(false);
    });
  });

  describe('数值约束', () => {
    it('应验证 minimum', () => {
      const schema: JSONSchema = { type: 'number', minimum: 0 };
      expect(validateAgainstSchema(5, schema).valid).toBe(true);
      expect(validateAgainstSchema(0, schema).valid).toBe(true);
      expect(validateAgainstSchema(-1, schema).valid).toBe(false);
    });

    it('应验证 maximum', () => {
      const schema: JSONSchema = { type: 'number', maximum: 100 };
      expect(validateAgainstSchema(50, schema).valid).toBe(true);
      expect(validateAgainstSchema(100, schema).valid).toBe(true);
      expect(validateAgainstSchema(101, schema).valid).toBe(false);
    });

    it('应验证 exclusiveMinimum', () => {
      const schema: JSONSchema = { type: 'number', exclusiveMinimum: 0 };
      expect(validateAgainstSchema(1, schema).valid).toBe(true);
      expect(validateAgainstSchema(0, schema).valid).toBe(false);
    });

    it('应验证 multipleOf', () => {
      const schema: JSONSchema = { type: 'number', multipleOf: 5 };
      expect(validateAgainstSchema(15, schema).valid).toBe(true);
      expect(validateAgainstSchema(17, schema).valid).toBe(false);
    });
  });

  describe('数组约束', () => {
    it('应验证 minItems', () => {
      const schema: JSONSchema = { type: 'array', minItems: 2 };
      expect(validateAgainstSchema([1, 2], schema).valid).toBe(true);
      expect(validateAgainstSchema([1], schema).valid).toBe(false);
    });

    it('应验证 maxItems', () => {
      const schema: JSONSchema = { type: 'array', maxItems: 3 };
      expect(validateAgainstSchema([1, 2, 3], schema).valid).toBe(true);
      expect(validateAgainstSchema([1, 2, 3, 4], schema).valid).toBe(false);
    });

    it('应验证 uniqueItems', () => {
      const schema: JSONSchema = { type: 'array', uniqueItems: true };
      expect(validateAgainstSchema([1, 2, 3], schema).valid).toBe(true);
      expect(validateAgainstSchema([1, 2, 1], schema).valid).toBe(false);
    });

    it('应验证数组元素类型', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: { type: 'string' },
      };
      expect(validateAgainstSchema(['a', 'b', 'c'], schema).valid).toBe(true);
      const result = validateAgainstSchema(['a', 1, 'c'], schema);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === '[1]')).toBe(true);
    });
  });

  describe('对象约束', () => {
    it('应验证 required 字段', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      };
      expect(validateAgainstSchema({ name: 'test' }, schema).valid).toBe(true);
      const result = validateAgainstSchema({ age: 25 }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.constraint === 'required')).toBe(true);
    });

    it('应验证 minProperties', () => {
      const schema: JSONSchema = { type: 'object', minProperties: 2 };
      expect(validateAgainstSchema({ a: 1, b: 2 }, schema).valid).toBe(true);
      expect(validateAgainstSchema({ a: 1 }, schema).valid).toBe(false);
    });

    it('应验证 maxProperties', () => {
      const schema: JSONSchema = { type: 'object', maxProperties: 2 };
      expect(validateAgainstSchema({ a: 1, b: 2 }, schema).valid).toBe(true);
      expect(validateAgainstSchema({ a: 1, b: 2, c: 3 }, schema).valid).toBe(false);
    });

    it('应验证 additionalProperties: false', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        additionalProperties: false,
      };
      expect(validateAgainstSchema({ name: 'test' }, schema).valid).toBe(true);
      const result = validateAgainstSchema({ name: 'test', extra: 1 }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.constraint === 'additionalProperties')).toBe(true);
    });
  });

  describe('嵌套结构验证', () => {
    it('应验证嵌套对象', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'number' },
            },
            required: ['name'],
          },
        },
      };
      expect(validateAgainstSchema({ user: { name: 'test', age: 25 } }, schema).valid).toBe(true);
      const result = validateAgainstSchema({ user: { age: 25 } }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'user.name')).toBe(true);
    });

    it('应验证嵌套数组中的对象', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            name: { type: 'string' },
          },
          required: ['id'],
        },
      };
      expect(
        validateAgainstSchema([{ id: 1, name: 'a' }, { id: 2 }], schema).valid
      ).toBe(true);
      const result = validateAgainstSchema([{ id: 1 }, { name: 'b' }], schema);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === '[1].id')).toBe(true);
    });
  });

  describe('默认值应用', () => {
    it('应应用顶层默认值', () => {
      const schema: JSONSchema = { type: 'string', default: 'default-value' };
      const result = validateAgainstSchema(undefined, schema);
      expect(result.data).toBe('default-value');
    });

    it('应应用对象属性默认值', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          role: { type: 'string', default: 'user' },
        },
      };
      const result = validateAgainstSchema({ name: 'test' }, schema);
      expect(result.data).toEqual({ name: 'test', role: 'user' });
    });

    it('应应用数组元素默认值', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            value: { type: 'number', default: 0 },
          },
        },
      };
      const result = validateAgainstSchema([{}, { value: 5 }], schema);
      expect(result.data).toEqual([{ value: 0 }, { value: 5 }]);
    });
  });

  describe('错误信息质量', () => {
    it('应提供清晰的类型错误信息', () => {
      const schema: JSONSchema = { type: 'string' };
      const result = validateAgainstSchema(123, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('类型不匹配');
      expect(result.errors[0].message).toContain('string');
    });

    it('应提供正确的错误路径', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          config: {
            type: 'object',
            properties: {
              port: { type: 'number' },
            },
          },
        },
      };
      const result = validateAgainstSchema({ config: { port: 'invalid' } }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].path).toBe('config.port');
    });

    it('应提供完整的约束错误信息', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
        },
        required: ['email', 'name'],
      };
      const result = validateAgainstSchema({}, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(2);
      expect(result.errors.every(e => e.constraint === 'required')).toBe(true);
    });
  });
});

describe('isValid', () => {
  it('应返回 boolean 而非完整结果', () => {
    const schema: JSONSchema = { type: 'string' };
    expect(isValid('hello', schema)).toBe(true);
    expect(isValid(123, schema)).toBe(false);
  });
});

describe('实际工具参数验证场景', () => {
  it('应验证文件读取工具参数', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '文件路径',
          minLength: 1,
        },
        encoding: {
          type: 'string',
          enum: ['utf-8', 'binary'],
          default: 'utf-8',
        },
      },
      required: ['path'],
    };

    // 有效输入
    expect(validateAgainstSchema({ path: '/tmp/file.txt' }, schema).valid).toBe(true);
    
    // 应用默认值
    const result = validateAgainstSchema({ path: '/tmp/file.txt' }, schema);
    expect(result.data).toEqual({ path: '/tmp/file.txt', encoding: 'utf-8' });

    // 缺少必填字段
    const missingResult = validateAgainstSchema({}, schema);
    expect(missingResult.valid).toBe(false);
    expect(missingResult.errors.some(e => e.constraint === 'required')).toBe(true);

    // 空路径
    const emptyPathResult = validateAgainstSchema({ path: '' }, schema);
    expect(emptyPathResult.valid).toBe(false);
    expect(emptyPathResult.errors.some(e => e.constraint === 'minLength')).toBe(true);

    // 无效枚举值
    const invalidEnumResult = validateAgainstSchema({ path: '/tmp', encoding: 'invalid' }, schema);
    expect(invalidEnumResult.valid).toBe(false);
    expect(invalidEnumResult.errors.some(e => e.constraint === 'enum')).toBe(true);
  });

  it('应验证搜索工具参数', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          minLength: 1,
          maxLength: 1000,
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 10,
        },
        filters: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 10,
        },
      },
      required: ['query'],
    };

    // 有效输入
    expect(
      validateAgainstSchema({ query: 'test', limit: 20 }, schema).valid
    ).toBe(true);

    // 超出范围
    const overLimitResult = validateAgainstSchema({ query: 'test', limit: 200 }, schema);
    expect(overLimitResult.valid).toBe(false);
    expect(overLimitResult.errors.some(e => e.constraint === 'maximum')).toBe(true);

    // 过多过滤器
    const tooManyFilters = validateAgainstSchema({
      query: 'test',
      filters: Array(15).fill('filter'),
    }, schema);
    expect(tooManyFilters.valid).toBe(false);
    expect(tooManyFilters.errors.some(e => e.constraint === 'maxItems')).toBe(true);
  });
});
