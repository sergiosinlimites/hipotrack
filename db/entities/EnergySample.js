const { EntitySchema } = require('typeorm');

module.exports = new EntitySchema({
  name: 'EnergySample',
  tableName: 'energy_samples',
  columns: {
    id: {
      primary: true,
      type: 'uuid',
      generated: 'uuid',
    },
    voltage: {
      type: Number,
    },
    current: {
      type: Number,
    },
    watts: {
      type: Number,
    },
    cpu_temp: {
      type: Number,
    },
    measured_at: {
      type: 'timestamptz',
      nullable: false,
    },
  },
  relations: {
    camera: {
      type: 'many-to-one',
      target: 'Camera',
      joinColumn: {
        name: 'camera_id',
      },
      onDelete: 'CASCADE',
      nullable: false,
    },
  },
});


