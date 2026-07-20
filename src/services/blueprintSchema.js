import { BLUEPRINT_SECTIONS } from '../config/blueprintSections';

export const createBlueprintSchema = () => {
  const schema = {};
  BLUEPRINT_SECTIONS.forEach(section => {
    schema[section.id] = {
      id: section.id,
      title: section.title,
      type: section.type,
      status: 'pending',
      content: '',
      generationSource: null,
      generatedBy: null,
      validationScores: null,
      generatedAt: null,
      failureReason: null
    };
  });
  return schema;
};
