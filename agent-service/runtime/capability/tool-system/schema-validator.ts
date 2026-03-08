/**
 * JSON Schema 验证器
 *
 * 轻量级实现，不引入额外依赖，支持 JSON Schema Draft 2020-12 核心验证能力。
 */

import type { JSONSchema } from '../../../types';

// ============================================================================
// 类型定义
// ============================================================================

/** 验证错误 */
export interface ValidationError {
  /** 错误路径，如 "properties.path" */
  path: string;
  /** 错误消息 */
  message: string;
  /** 错误值 */
  value?: unknown;
  /** 约束类型 */
  constraint?: string;
}

/** 验证结果 */
export interface ValidationResult {
  /** 是否验证通过 */
  valid: boolean;
  /** 错误列表 */
  errors: ValidationError[];
  /** 验证后的数据（应用默认值后） */
  data: unknown;
}

// ============================================================================
// 类型验证
// ============================================================================

const TYPE_CHECKERS: Record<string, (value: unknown) => boolean> = {
  string: (v): v is string => typeof v === 'string',
  number: (v): v is number => typeof v === 'number' && !Number.isNaN(v),
  integer: (v): v is number => typeof v === 'number' && Number.isInteger(v),
  boolean: (v): v is boolean => typeof v === 'boolean',
  array: (v): v is unknown[] => Array.isArray(v),
  object: (v): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v),
  null: (v): v is null => v === null,
};

/**
 * 验证类型匹配
 */
export function validateType(value: unknown, type: string): boolean {
  const checker = TYPE_CHECKERS[type];
  return checker ? checker(value) : false;
}

/**
 * 验证类型是否匹配（支持类型数组）
 */
function checkTypes(value: unknown, types: string | string[]): boolean {
  const typeArray = Array.isArray(types) ? types : [types];
  return typeArray.some(type => validateType(value, type));
}

// ============================================================================
// 约束验证
// ============================================================================

interface ConstraintValidator {
  (value: unknown, schema: JSONSchema, path: string): ValidationError[];
}

/** 字符串约束验证 */
const stringConstraints: ConstraintValidator = (value, schema, path) => {
  const errors: ValidationError[] = [];
  if (typeof value !== 'string') return errors;

  if (schema.minLength !== undefined && value.length < schema.minLength) {
    errors.push({
      path,
      message: `字符串长度 ${value.length} 小于最小长度 ${schema.minLength}`,
      value,
      constraint: 'minLength',
    });
  }

  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    errors.push({
      path,
      message: `字符串长度 ${value.length} 大于最大长度 ${schema.maxLength}`,
      value,
      constraint: 'maxLength',
    });
  }

  if (schema.pattern !== undefined) {
    const regex = new RegExp(schema.pattern);
    if (!regex.test(value)) {
      errors.push({
        path,
        message: `字符串 "${value}" 不匹配模式 "${schema.pattern}"`,
        value,
        constraint: 'pattern',
      });
    }
  }

  return errors;
};

/** 数值约束验证 */
const numberConstraints: ConstraintValidator = (value, schema, path) => {
  const errors: ValidationError[] = [];
  if (typeof value !== 'number') return errors;

  if (schema.minimum !== undefined && value < schema.minimum) {
    errors.push({
      path,
      message: `数值 ${value} 小于最小值 ${schema.minimum}`,
      value,
      constraint: 'minimum',
    });
  }

  if (schema.maximum !== undefined && value > schema.maximum) {
    errors.push({
      path,
      message: `数值 ${value} 大于最大值 ${schema.maximum}`,
      value,
      constraint: 'maximum',
    });
  }

  if (schema.exclusiveMinimum !== undefined) {
    const min = typeof schema.exclusiveMinimum === 'boolean'
      ? schema.minimum
      : schema.exclusiveMinimum;
    if (min !== undefined && value <= min) {
      errors.push({
        path,
        message: `数值 ${value} 必须大于 ${min}`,
        value,
        constraint: 'exclusiveMinimum',
      });
    }
  }

  if (schema.exclusiveMaximum !== undefined) {
    const max = typeof schema.exclusiveMaximum === 'boolean'
      ? schema.maximum
      : schema.exclusiveMaximum;
    if (max !== undefined && value >= max) {
      errors.push({
        path,
        message: `数值 ${value} 必须小于 ${max}`,
        value,
        constraint: 'exclusiveMaximum',
      });
    }
  }

  if (schema.multipleOf !== undefined && value % schema.multipleOf !== 0) {
    errors.push({
      path,
      message: `数值 ${value} 不是 ${schema.multipleOf} 的倍数`,
      value,
      constraint: 'multipleOf',
    });
  }

  return errors;
};

/** 数组约束验证 */
const arrayConstraints: ConstraintValidator = (value, schema, path) => {
  const errors: ValidationError[] = [];
  if (!Array.isArray(value)) return errors;

  if (schema.minItems !== undefined && value.length < schema.minItems) {
    errors.push({
      path,
      message: `数组长度 ${value.length} 小于最小长度 ${schema.minItems}`,
      value,
      constraint: 'minItems',
    });
  }

  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    errors.push({
      path,
      message: `数组长度 ${value.length} 大于最大长度 ${schema.maxItems}`,
      value,
      constraint: 'maxItems',
    });
  }

  if (schema.uniqueItems === true) {
    const seen = new Set();
    for (const item of value) {
      const key = JSON.stringify(item);
      if (seen.has(key)) {
        errors.push({
          path,
          message: '数组包含重复元素',
          value,
          constraint: 'uniqueItems',
        });
        break;
      }
      seen.add(key);
    }
  }

  return errors;
};

/** 对象约束验证 */
const objectConstraints: ConstraintValidator = (value, schema, path) => {
  const errors: ValidationError[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return errors;

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);

  if (schema.minProperties !== undefined && keys.length < schema.minProperties) {
    errors.push({
      path,
      message: `对象属性数量 ${keys.length} 小于最小数量 ${schema.minProperties}`,
      value,
      constraint: 'minProperties',
    });
  }

  if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) {
    errors.push({
      path,
      message: `对象属性数量 ${keys.length} 大于最大数量 ${schema.maxProperties}`,
      value,
      constraint: 'maxProperties',
    });
  }

  return errors;
};

// ============================================================================
// 核心验证逻辑
// ============================================================================

/**
 * 验证必填字段
 */
export function validateRequired(input: unknown, required: string[]): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    if (required.length > 0) {
      errors.push({
        path: '',
        message: '输入必须是对象类型才能验证必填字段',
        value: input,
        constraint: 'required',
      });
    }
    return errors;
  }

  const obj = input as Record<string, unknown>;
  for (const field of required) {
    if (!(field in obj) || obj[field] === undefined) {
      errors.push({
        path: field,
        message: `缺少必填字段: ${field}`,
        constraint: 'required',
      });
    }
  }

  return errors;
}

/**
 * 验证枚举值
 */
function validateEnum(value: unknown, enumValues: unknown[], path: string): ValidationError | null {
  if (!enumValues.includes(value)) {
    return {
      path,
      message: `值 "${value}" 不在枚举列表 [${enumValues.join(', ')}] 中`,
      value,
      constraint: 'enum',
    };
  }
  return null;
}

/**
 * 应用默认值
 */
function applyDefaults(input: unknown, schema: JSONSchema): unknown {
  if (schema.default !== undefined && input === undefined) {
    return schema.default;
  }

  // 递归处理对象属性
  if (schema.type === 'object' && schema.properties && typeof input === 'object' && input !== null && !Array.isArray(input)) {
    const obj = { ...input } as Record<string, unknown>;
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (obj[key] === undefined && propSchema.default !== undefined) {
        obj[key] = propSchema.default;
      } else if (obj[key] !== undefined && typeof propSchema === 'object') {
        obj[key] = applyDefaults(obj[key], propSchema);
      }
    }
    return obj;
  }

  // 递归处理数组元素
  if (schema.type === 'array' && schema.items && Array.isArray(input)) {
    const itemSchema = Array.isArray(schema.items) ? undefined : schema.items;
    if (itemSchema) {
      return input.map(item => applyDefaults(item, itemSchema));
    }
  }

  return input;
}

/**
 * 验证单个值
 */
function validateValue(
  value: unknown,
  schema: JSONSchema,
  path: string,
  errors: ValidationError[]
): void {
  // 类型检查
  if (schema.type !== undefined) {
    if (!checkTypes(value, schema.type)) {
      errors.push({
        path,
        message: `类型不匹配: 期望 ${Array.isArray(schema.type) ? schema.type.join('|') : schema.type}，实际 ${Array.isArray(value) ? 'array' : typeof value}`,
        value,
        constraint: 'type',
      });
      return; // 类型错误不再继续验证
    }
  }

  // 枚举检查
  if (schema.enum !== undefined) {
    const enumError = validateEnum(value, schema.enum, path);
    if (enumError) errors.push(enumError);
  }

  // 约束验证
  errors.push(...stringConstraints(value, schema, path));
  errors.push(...numberConstraints(value, schema, path));
  errors.push(...arrayConstraints(value, schema, path));
  errors.push(...objectConstraints(value, schema, path));
}

/**
 * 递归验证对象属性
 */
function validateObject(
  input: Record<string, unknown>,
  schema: JSONSchema,
  path: string,
  errors: ValidationError[]
): void {
  const properties = schema.properties || {};
  const required = schema.required || [];
  const additionalProps = schema.additionalProperties;

  // 验证必填字段
  for (const field of required) {
    if (!(field in input) || input[field] === undefined) {
      errors.push({
        path: path ? `${path}.${field}` : field,
        message: `缺少必填字段: ${field}`,
        constraint: 'required',
      });
    }
  }

  // 验证每个属性
  for (const [key, value] of Object.entries(input)) {
    const propPath = path ? `${path}.${key}` : key;
    const propSchema = properties[key];

    if (propSchema) {
      // 有定义的属性
      validateValue(value, propSchema, propPath, errors);

      // 递归验证嵌套对象
      if (propSchema.type === 'object' && propSchema.properties && typeof value === 'object' && value !== null) {
        validateObject(value as Record<string, unknown>, propSchema, propPath, errors);
      }

      // 递归验证数组元素
      if (propSchema.type === 'array' && propSchema.items && Array.isArray(value)) {
        const itemSchema = Array.isArray(propSchema.items) ? undefined : propSchema.items;
        if (itemSchema) {
          for (let i = 0; i < value.length; i++) {
            const itemPath = `${propPath}[${i}]`;
            validateValue(value[i], itemSchema, itemPath, errors);
          }
        }
      }
    } else if (additionalProps === false) {
      // 不允许额外属性
      errors.push({
        path: propPath,
        message: `不允许的属性: ${key}`,
        value,
        constraint: 'additionalProperties',
      });
    }
  }
}

/**
 * 验证输入是否符合 JSON Schema
 *
 * @param input - 待验证的输入数据
 * @param schema - JSON Schema 定义
 * @returns 验证结果
 */
export function validateAgainstSchema(
  input: unknown,
  schema: JSONSchema
): ValidationResult {
  const errors: ValidationError[] = [];

  // 应用默认值
  const data = applyDefaults(input, schema);

  // 空输入检查
  if (data === undefined || data === null) {
    if (schema.type !== undefined && !checkTypes(data, schema.type)) {
      errors.push({
        path: '',
        message: `输入不能为空，期望类型: ${Array.isArray(schema.type) ? schema.type.join('|') : schema.type}`,
        value: data,
        constraint: 'type',
      });
    }
    return { valid: errors.length === 0, errors, data };
  }

  // 类型验证
  if (schema.type !== undefined) {
    if (!checkTypes(data, schema.type)) {
      errors.push({
        path: '',
        message: `类型不匹配: 期望 ${Array.isArray(schema.type) ? schema.type.join('|') : schema.type}，实际 ${Array.isArray(data) ? 'array' : typeof data}`,
        value: data,
        constraint: 'type',
      });
      return { valid: false, errors, data };
    }
  }

  // 枚举验证
  if (schema.enum !== undefined) {
    const enumError = validateEnum(data, schema.enum, '');
    if (enumError) errors.push(enumError);
  }

  // 顶层值约束验证（字符串、数字、数组、对象的约束检查）
  validateValue(data, schema, '', errors);

  // 对象属性验证
  if ((schema.type === 'object' || !schema.type) && schema.properties && typeof data === 'object' && data !== null && !Array.isArray(data)) {
    validateObject(data as Record<string, unknown>, schema, '', errors);
  }

  // 数组元素验证
  if ((schema.type === 'array' || !schema.type) && schema.items && Array.isArray(data)) {
    const itemSchema = Array.isArray(schema.items) ? undefined : schema.items;
    if (itemSchema) {
      for (let i = 0; i < data.length; i++) {
        const itemPath = `[${i}]`;
        validateValue(data[i], itemSchema, itemPath, errors);

        // 递归验证数组元素中的嵌套对象
        if (itemSchema.type === 'object' && itemSchema.properties &&
            typeof data[i] === 'object' && data[i] !== null && !Array.isArray(data[i])) {
          validateObject(data[i] as Record<string, unknown>, itemSchema, itemPath, errors);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data,
  };
}

/**
 * 快速验证（仅返回是否通过）
 */
export function isValid(input: unknown, schema: JSONSchema): boolean {
  return validateAgainstSchema(input, schema).valid;
}
