const { EntitySchema } = require('typeorm');

module.exports = new EntitySchema({
  name: 'Camera',
  tableName: 'cameras',
  columns: {
    id: {
      type: String,
      primary: true,
    },
    name: {
      type: String,
    },
    location: {
      type: String,
      nullable: true,
    },
    status: {
      type: String,
      default: 'waiting',
    },
    type: {
      type: String,
      default: 'USB',
    },
    url: {
      type: String,
      nullable: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    thumbnail: {
      type: String,
      nullable: true,
    },
    coordinates: {
      type: 'jsonb',
      nullable: true,
    },
    last_seen_at: {
      type: 'timestamptz',
      nullable: true,
    },
    created_at: {
      type: 'timestamptz',
      createDate: true,
    },
    updated_at: {
      type: 'timestamptz',
      updateDate: true,
    },
  },
});


