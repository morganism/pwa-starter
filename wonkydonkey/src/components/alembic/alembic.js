import React from 'react';
import { mergeClasses } from '@magento/venia-ui/lib/classify';
import { shape, string } from 'prop-types';

import defaultClasses from './alembic.module.css';

const alembic = props => {
    const classes = mergeClasses(defaultClasses, props.classes);
    return <div className={classes.root} />;
};

alembic.propTypes = {
    classes: shape({ root: string })
};
alembic.defaultProps = {};
export default alembic;

