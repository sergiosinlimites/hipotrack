const { EntitySchema } = require('typeorm');

module.exports = new EntitySchema({
  name: 'DataUsageEvent',
  tableName: 'data_usage_events',
  columns: {
    id: {
      primary: true,
      type: 'uuid',
      generated: 'uuid',
    },
    type: {
      type: String,
    },
    bytes: {
      type: 'bigint',
    },
    created_at: {
      type: 'timestamptz',
      createDate: true,
    },
  },
  relations: {
    camera: {
      type: 'many-to-one',
      target: 'Camera',
      joinColumn: {
        name: 'camera_id',
      },
      onDelete: 'SET NULL',
      nullable: true,
    },
  },
});



