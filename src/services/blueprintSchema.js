import { BLUEPRINT_SECTIONS } from '../config/blueprintSections';

export const createBlueprintSchema = () => {
  const schema = {};
  BLUEPRINT_SECTIONS.forEach(section => {
    schema[section.id] = {
      id: section.id,
      title: section.title,
      type: section.type,
      status: 'pending',
      confidence: null,
      content: '',
      lastModifiedVersion: 'v1'
    };
  });
  return schema;
};
